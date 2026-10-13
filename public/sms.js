// SMS simulator (owner-only, TEST_CLOCK=1): a phone-like thread for one member. Sends go to
// sms/simulate (the same inbound handler as the Twilio webhook); the thread also shows texts
// CrewBrain sent them (owner answers, relays, invitations), polled from sms/simulate/thread.
import { api, h, downscale } from "./common.js";

const $ = (s) => document.querySelector(s);
let members = [], current = null, busy = false, pendingImg = null, lastJson = "";

const TRIES = {
  crew: ["What's the plan today?", "Found rot, logging it", "Tell the homeowner we'll arrive at 8 tomorrow", "switch", "HELP"],
  home: ["How long does the battery last in a blackout?", "Can you paint the garage door?", "Can someone come by for a walkthrough?", "switch", "STOP", "START"],
};

function bubble(m) {
  const cls = m.dir === "in" ? "me" : "them";
  const meta = m.dir === "out" && m.status !== "reply" ? `${m.kind || "text"} · ${m.status}` : "";
  return h("div", { class: "b " + cls }, m.body, meta ? h("div", { class: "meta" }, meta) : null);
}

async function refresh() {
  if (!current) return;
  const r = await api(`sms/simulate/thread?member=${encodeURIComponent(current.id)}`);
  if (!r.ok) return;
  const json = JSON.stringify(r.data.messages);
  if (json === lastJson) return;
  lastJson = json;
  const t = $("#thread");
  t.replaceChildren(...(r.data.messages.length ? r.data.messages.map(bubble) : [h("div", { class: "b note" }, "No texts yet.")]));
  t.scrollTop = t.scrollHeight;
}

function pick(m) {
  current = m; lastJson = "";
  for (const b of document.querySelectorAll(".who button")) b.setAttribute("aria-pressed", String(b.dataset.id === m.id));
  $("#from").textContent = `${m.name} · ${m.phone}`;
  const crew = /crew|roof/i.test(m.name);
  $("#tries").replaceChildren(...(crew ? TRIES.crew : TRIES.home).map((t) => h("button", { type: "button", onclick: () => send(t) }, t)));
  try { localStorage.setItem("cb_sms_member", m.id); } catch {}
  refresh();
}

async function send(text) {
  if (!current || busy || (!text.trim() && !pendingImg)) return;
  busy = true; $("#send").disabled = true;
  const t = $("#thread");
  t.append(h("div", { class: "b me" }, pendingImg ? h("img", { src: pendingImg, alt: "photo" }) : null, text));
  const typing = h("div", { class: "b note" }, "…");
  t.append(typing); t.scrollTop = t.scrollHeight;
  const r = await api("sms/simulate", { member: current.id, text, ...(pendingImg ? { imageDataUrl: pendingImg } : {}) });
  typing.remove();
  pendingImg = null; $("#msg").value = ""; $("#pic").value = "";
  if (!r.ok) t.append(h("div", { class: "b note" }, (r.data && (r.data.reply || r.data.error)) || "Failed"));
  lastJson = "";
  await refresh();
  busy = false; $("#send").disabled = false; $("#msg").focus();
}

async function boot() {
  const r = await api("sms/simulate");
  if (!r.ok) {
    $("#who").replaceChildren(h("p", {}, "Sign in as the owner (demo build only) to use the simulator."));
    $("#mode").textContent = "unavailable";
    return;
  }
  $("#mode").textContent = r.data.configured ? "Twilio on: real numbers get real texts" : "Simulated: nothing is sent";
  members = r.data.members;
  $("#who").replaceChildren(...members.map((m) => h("button", { type: "button", "data-id": m.id, "aria-pressed": "false", disabled: !m.phone, onclick: () => pick(m) },
    m.name, h("small", {}, m.phone ? m.phone + (m.optedOut ? " · opted out" : "") : "no phone: ask CrewBrain to add one"))));
  let saved = null; try { saved = localStorage.getItem("cb_sms_member"); } catch {}
  const first = members.find((m) => m.id === saved && m.phone) || members.find((m) => m.phone);
  if (first) pick(first);
  setInterval(refresh, 3000);
}

$("#f").addEventListener("submit", (e) => { e.preventDefault(); send($("#msg").value); });
$("#pic").addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  pendingImg = await downscale(f);
  $("#msg").placeholder = "Photo attached. Add a note or Send";
});
boot();
