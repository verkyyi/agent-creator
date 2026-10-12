// Crewbrain voice layer — OpenAI Realtime (speech-to-speech) over WebRTC.
// The model is only a voice: every utterance is relayed verbatim to our backend via the `relay` tool.
// All Crewbrain URLs are RELATIVE (the app is mounted at / and /crewbrain/).

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

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
  if (err && err.message && err.friendly) return err.message;
  return "Couldn't connect voice. Check your network and try again.";
}

function codedError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

export async function startVoice({ mode, agentId, persona, onState, onTranscript, onReply, onError } = {}) {
  const state = (s) => { try { onState && onState(s); } catch (_) {} };
  const fail = (err) => { try { onError && onError(friendly(err), err); } catch (_) {} };

  let pc = null;
  let dc = null;
  let mic = null;
  let audioEl = null;
  let stopped = false;
  const handledCalls = new Set();

  function stop() {
    if (stopped) return;
    stopped = true;
    try { dc && dc.close(); } catch (_) {}
    try { pc && pc.getSenders().forEach((s) => s.track && s.track.stop()); } catch (_) {}
    try { mic && mic.getTracks().forEach((t) => t.stop()); } catch (_) {}
    try { pc && pc.close(); } catch (_) {}
    if (audioEl) {
      try { audioEl.srcObject = null; audioEl.remove(); } catch (_) {}
    }
    state("stopped");
  }

  function send(evt) {
    if (dc && dc.readyState === "open") dc.send(JSON.stringify(evt));
  }

  async function relay(callId, argsJson, relayPath) {
    let text = "";
    try { text = String(JSON.parse(argsJson || "{}").text || ""); } catch (_) {}
    state("thinking");
    let json;
    try {
      const res = await fetch(relayPath, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      try { json = await res.json(); } catch (_) { json = { error: "Sorry, something went wrong." }; }
    } catch (_) {
      json = { error: "Sorry, I couldn't reach the server." };
    }
    if (stopped) return;
    try { onReply && onReply(json); } catch (_) {}
    const reply = json.reply ?? json.error ?? "Sorry, something went wrong.";
    send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ reply }) },
    });
    send({ type: "response.create" });
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
    if (!r.ok || !sess.clientSecret) throw codedError("session_failed");
    const relayPath = sess.relayPath;

    // 2. Microphone.
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (stopped) { stop(); return { stop }; }

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
    dc.onopen = () => state("listening");
    dc.onmessage = (m) => {
      let evt;
      try { evt = JSON.parse(m.data); } catch (_) { return; }
      switch (evt.type) {
        case "input_audio_buffer.speech_started":
          state("listening");
          break;
        case "input_audio_buffer.speech_stopped":
          state("thinking");
          break;
        case "conversation.item.input_audio_transcription.completed":
          if (evt.transcript && evt.transcript.trim()) onTranscript && onTranscript(evt.transcript.trim(), "user");
          break;
        case "response.function_call_arguments.done":
          if (evt.name === "relay" && evt.call_id && !handledCalls.has(evt.call_id)) {
            handledCalls.add(evt.call_id);
            relay(evt.call_id, evt.arguments, relayPath);
          }
          break;
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done": // pre-GA name
          if (evt.transcript && evt.transcript.trim()) onTranscript && onTranscript(evt.transcript.trim(), "assistant");
          break;
        case "output_audio_buffer.started":
          state("speaking");
          break;
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          state("listening");
          break;
        case "error":
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
    if (stopped) return { stop };
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  } catch (err) {
    fail(err);
    stop();
  }

  return { stop };
}
