// Crewbrain voice layer — OpenAI Realtime (speech-to-speech) over WebRTC.
// mode "agent": gpt-realtime answers directly; facts come only from server-gated tools
//   (search_brain, log_issue, request_walkthrough) executed at api/voice/tool.
// mode "creator": the model is only a voice; every utterance is relayed to the backend via `relay`.
// All Crewbrain URLs are RELATIVE (the app is mounted at / and /crewbrain/).

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const CHECKIN_MS = 8000;

let lastRemoteStream = null;

/** The model's remote audio MediaStream (for the video recorder). */
export function getLastRemoteStream() {
  return lastRemoteStream;
}

function friendly(err) {
  const name = err && err.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone access was denied. Allow the mic in your browser settings and try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found on this device.";
  if (err && err.code === "voice_unavailable") return "Voice isn't available right now. You can still type.";
  if (err && err.code === "auth") return "Your session has expired. Open your personal link again.";
  if (err && err.code === "forbidden") return "This helper isn't shared with you.";
  if (err && err.message && err.friendly) return err.message;
  return "Couldn't connect voice. Check your network and try again.";
}

function codedError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json;
  try { json = await res.json(); } catch (_) { json = {}; }
  return { res, json };
}

export async function startVoice({ mode, agentId, persona, onState, onTranscript, onReply, onError, onMetrics, signal } = {}) {
  const state = (s) => { try { onState && onState(s); } catch (_) {} };
  const fail = (err) => { try { onError && onError(friendly(err), err); } catch (_) {} };
  const emit = (fn, ...a) => { try { fn && fn(...a); } catch (_) {} };
  const isAgent = mode === "agent";

  let pc = null;
  let dc = null;
  let mic = null;
  let audioEl = null;
  let stopped = false;
  const handledCalls = new Set();

  // Response bookkeeping: never send response.create while one is active.
  let responseActive = false;
  let pendingCalls = 0;
  let needResponse = false;
  let assistantSpeaking = false;

  // Per-turn state for onReply/history.
  let turnCitations = [];
  let turnAction = null;

  // Latency metrics.
  let turn = 0;
  let speechStoppedAt = 0;
  let ttfaPending = false;

  // Silence check-in.
  let silenceTimer = null;
  let checkins = 0;
  let goodbye = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(silenceTimer);
    try { dc && dc.close(); } catch (_) {}
    try { pc && pc.getSenders().forEach((s) => s.track && s.track.stop()); } catch (_) {}
    try { mic && mic.getTracks().forEach((t) => t.stop()); } catch (_) {}
    try { pc && pc.close(); } catch (_) {}
    if (audioEl) {
      try { audioEl.srcObject = null; audioEl.remove(); } catch (_) {}
    }
    state("stopped");
  }
  // The caller can cancel while we're still connecting (mic prompt, SDP exchange).
  if (signal) {
    if (signal.aborted) { stopped = true; return { stop }; }
    signal.addEventListener("abort", stop, { once: true });
  }

  function send(evt) {
    if (dc && dc.readyState === "open") dc.send(JSON.stringify(evt));
  }

  function requestResponse(response) {
    if (responseActive || pendingCalls > 0) { needResponse = true; return; }
    needResponse = false;
    responseActive = true; // optimistic; response.created/done keep it honest
    send(response ? { type: "response.create", response } : { type: "response.create" });
  }

  function markFirstAudio() {
    if (!ttfaPending) return;
    ttfaPending = false;
    const ttfaMs = Math.round(performance.now() - speechStoppedAt);
    console.log(`[voice] ttfa=${ttfaMs}ms turn=${turn}`);
    emit(onMetrics, { ttfaMs, turn });
  }

  function armSilence() {
    clearTimeout(silenceTimer);
    if (!isAgent || stopped) return;
    silenceTimer = setTimeout(() => {
      if (stopped || responseActive || assistantSpeaking) return;
      checkins += 1;
      if (checkins === 1) {
        requestResponse({ instructions: "The user has been quiet. Say a short, friendly check-in in one sentence, in the user's language." });
      } else {
        goodbye = true;
        requestResponse({ instructions: "The user is still quiet. Say a short, warm goodbye in one sentence, in the user's language. Do not ask a question." });
      }
    }, CHECKIN_MS);
  }

  function finishCall(callId, output) {
    if (stopped) return;
    send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) } });
    pendingCalls = Math.max(0, pendingCalls - 1);
    if (pendingCalls === 0) requestResponse();
  }

  async function relay(callId, argsJson, relayPath) {
    let text = "";
    try { text = String(JSON.parse(argsJson || "{}").text || ""); } catch (_) {}
    state("thinking");
    let json;
    try {
      ({ json } = await postJson(relayPath, { text }));
      if (!json || typeof json !== "object") json = { error: "Sorry, something went wrong." };
    } catch (_) {
      json = { error: "Sorry, I couldn't reach the server." };
    }
    if (stopped) return;
    emit(onReply, json);
    finishCall(callId, { reply: json.reply ?? json.error ?? "Sorry, something went wrong." });
  }

  async function agentTool(callId, name, argsJson) {
    let args = {};
    try { args = JSON.parse(argsJson || "{}"); } catch (_) {}
    state("thinking");
    let res, json;
    try {
      ({ res, json } = await postJson("api/voice/tool", { agentId, name, args }));
    } catch (_) {
      json = { error: "network", note: "The server couldn't be reached. Say so briefly and suggest typing instead." };
    }
    if (stopped) return;
    if ((res && res.status === 401) || (res && res.status === 403) || (json && (json.ended || json.error === "ended"))) {
      // Access lost or helper ended: say nothing further from the model.
      emit(onReply, json && json.reply ? { ...json, error: json.error || "ended" } : json);
      stop();
      return;
    }
    if (json && Array.isArray(json.excerpts)) {
      for (const x of json.excerpts) turnCitations.push({ title: x.title, section: x.section, version: x.version });
    }
    if (json && json.action) turnAction = json.action;
    finishCall(callId, json || {});
  }

  function logTranscript(role, text) {
    if (!isAgent || !text) return;
    postJson("api/voice/transcript", { agentId, role, text }).catch(() => {});
  }

  try {
    state("connecting");

    // 1. Ephemeral client secret from our server.
    let sess;
    const r = await fetch("api/voice/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, agentId, persona }),
    });
    try { sess = await r.json(); } catch (_) { sess = {}; }
    if (r.status === 503) throw codedError("voice_unavailable");
    if (r.status === 401) throw codedError("auth");
    if (r.status === 410) { emit(onReply, sess); stop(); return { stop }; }
    if (r.status === 403 || r.status === 404) throw codedError("forbidden");
    if (!r.ok || !sess.clientSecret) throw codedError("session_failed");
    const relayPath = sess.relayPath;
    const greeting = sess.greeting;

    // 2. Microphone.
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    // Cancelled while the mic prompt was open: stop() already ran, so release the mic here.
    if (stopped) { mic.getTracks().forEach((t) => t.stop()); mic = null; return { stop }; }

    // 3. Peer connection + remote audio (hidden <audio autoplay playsinline> for iOS Safari).
    pc = new RTCPeerConnection();
    audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.setAttribute("playsinline", "");
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);
    pc.ontrack = (e) => {
      lastRemoteStream = e.streams[0] || new MediaStream([e.track]);
      audioEl.srcObject = lastRemoteStream;
      const p = audioEl.play && audioEl.play();
      if (p && p.catch) p.catch(() => {});
    };
    pc.addTrack(mic.getAudioTracks()[0], mic);
    pc.onconnectionstatechange = () => {
      if (stopped) return;
      if (pc.connectionState === "failed") {
        fail(codedError("network"));
        stop();
      }
    };

    // 4. Events channel.
    dc = pc.createDataChannel("oai-events");
    dc.onopen = () => {
      state("listening");
      if (isAgent && greeting) {
        requestResponse({ instructions: `Say exactly this one sentence and nothing else: "${greeting}"` });
      }
    };
    dc.onmessage = (m) => {
      let evt;
      try { evt = JSON.parse(m.data); } catch (_) { return; }
      switch (evt.type) {
        case "input_audio_buffer.speech_started":
          clearTimeout(silenceTimer);
          checkins = 0;
          goodbye = false;
          // Barge-in: cut the assistant off instantly.
          if (assistantSpeaking || responseActive) {
            if (responseActive) send({ type: "response.cancel" });
            send({ type: "output_audio_buffer.clear" });
          }
          ttfaPending = false;
          turnCitations = [];
          turnAction = null;
          state("listening");
          break;
        case "input_audio_buffer.speech_stopped":
          turn += 1;
          speechStoppedAt = performance.now();
          ttfaPending = true;
          state("thinking");
          break;
        case "conversation.item.input_audio_transcription.completed":
          if (evt.transcript && evt.transcript.trim()) {
            emit(onTranscript, evt.transcript.trim(), "user");
            logTranscript("user", evt.transcript.trim());
          }
          break;
        case "response.created":
          responseActive = true;
          break;
        case "response.output_audio.delta":
        case "response.output_audio_transcript.delta":
        case "response.audio_transcript.delta": // pre-GA name
          markFirstAudio();
          break;
        case "response.function_call_arguments.done":
          if (evt.call_id && !handledCalls.has(evt.call_id)) {
            handledCalls.add(evt.call_id);
            pendingCalls += 1;
            if (!isAgent && evt.name === "relay") relay(evt.call_id, evt.arguments, relayPath);
            else if (isAgent) agentTool(evt.call_id, evt.name, evt.arguments);
            else finishCall(evt.call_id, { error: "unknown_tool" });
          }
          break;
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done": // pre-GA name
          if (evt.transcript && evt.transcript.trim()) emit(onTranscript, evt.transcript.trim(), "assistant");
          break;
        case "response.done": {
          responseActive = false;
          const resp = evt.response || {};
          const out = resp.output || [];
          const hadCall = out.some((o) => o.type === "function_call");
          if (isAgent && resp.status === "completed" && !hadCall) {
            const text = out
              .flatMap((o) => (o.content || []).map((c) => c.transcript || c.text || ""))
              .join(" ").trim();
            if (text) {
              emit(onReply, { reply: text, citations: turnCitations.slice(), ...(turnAction ? { action: turnAction } : {}) });
              logTranscript("helper", text);
            }
            turnCitations = [];
            turnAction = null;
          }
          if (needResponse && pendingCalls === 0) requestResponse();
          if (goodbye && !hadCall) {
            // Let the goodbye finish playing, then hang up.
            const waitEnd = () => {
              if (stopped) return;
              if (assistantSpeaking) return setTimeout(waitEnd, 200);
              stop(); // emits onState("stopped")
            };
            setTimeout(waitEnd, 400);
          }
          break;
        }
        case "output_audio_buffer.started":
          assistantSpeaking = true;
          clearTimeout(silenceTimer);
          markFirstAudio();
          state("speaking");
          break;
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          assistantSpeaking = false;
          state("listening");
          if (!responseActive && pendingCalls === 0 && !goodbye) armSilence();
          break;
        case "error":
          // A cancel with nothing to cancel is expected during barge-in.
          if (evt.error && evt.error.code === "response_cancel_not_active") break;
          if (evt.error && evt.error.code === "conversation_already_has_active_response") { needResponse = true; break; }
          console.warn("[voice] realtime error", evt.error);
          break;
      }
    };

    // 5. SDP offer/answer directly with OpenAI using the ephemeral secret.
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdpRes = await fetch(REALTIME_CALLS_URL, {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${sess.clientSecret}`, "Content-Type": "application/sdp" },
    });
    if (!sdpRes.ok) throw codedError("network");
    const answerSdp = await sdpRes.text();
    if (stopped) { try { pc.close(); } catch (_) {} return { stop }; }
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  } catch (err) {
    fail(err);
    stop();
  }

  return { stop };
}
