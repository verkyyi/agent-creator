/* UI string tables. EN is the source of truth: the server translates it for any other
   language (GET api/i18n/:lang). Placeholders in {braces} are filled by fmt(); keep them as-is. */
export const EN = {
  ask: "Ask anything…", photoPh: "Say what's wrong…", send: "Send", talk: "Tap and talk", stopTalk: "Stop talking",
  attach: "Add a photo", report: "Report a problem", photoAttached: "Photo attached", removePhoto: "Remove photo",
  ends: "Works until", canDo: "Can also", endedTitle: "This helper has ended", ended: "ended", theOwner: "The owner",
  expired: "This link stopped working {e}. Thanks for working with {c}.",
  revoked: "{o} closed this job, so this link no longer works. Thanks for working with {c}.",
  lostTitle: "Open your personal link again", lost: "You were signed out on this phone. Tap the personal link you were sent to keep going.",
  notFound: "Helper not found", notFoundText: "Check the link you were sent, or ask the person who sent it.",
  missing: "This link is missing part of its address. Open the link you were sent.",
  hi: "Hi {n}, I'm {h} from {c}.", hiAnon: "Hi, I'm {h} from {c}.",
  helpsWith: "I can help with {j}.", worksUntil: "I work until {e}.",
  typeInstead: "Type instead", notShare: "Not something I can share",
  source: "Source", foundIn: "Found in", checking: "Checking your notes…", source1: "1 source", sourcesN: "{n} sources",
  loading: "Loading…", sendFail: "That didn't go through. Check your signal and send it again.",
  aiDown: "The AI assistant is unavailable right now, so this answer is quoted straight from the company's notes.",
  answered: "{o} answered:", savedTo: "Saved to {c}'s knowledge",
  logged: "Sent to {o}: ", walk: "Walkthrough requested from {o}: ",
  relayAsk: "Waiting for {o} to approve: ", relaySent: "Sent to the homeowners: ", updateFrom: "Update from {c}",
  photoFail: "Couldn't open that photo. Try taking it again.", herePhoto: "Here's a photo.",
  voiceErr: "Voice isn't available right now. Type your message instead.",
  language: "Language", auto: "Auto", other: "Other…", otherPrompt: "Language code (for example nl, sw, pt-BR)",
  vs: { connecting: "Getting ready…", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…" },
  vo: {
    title: "Voice", end: "End", mute: "Mute", unmute: "Unmute", captions: "Captions", ended: "Voice ended",
    conversation: "Voice conversation", turn1: "1 turn", turnsN: "{n} turns", results: "Results",
    showTranscript: "Show transcript", hideTranscript: "Hide transcript",
    autoNote: "Automatic transcript; may differ slightly from what was said.", you: "You", needsTap: "Needs your tap", ttfa: "Time to first audio",
  },
  crew: ["What's the gate code?", "Where do we park?", "What's today's schedule?"],
  home: ["Will my fridge stay on in a blackout?", "When is the inspection?", "Can we add a second battery later?"],
  company: "your contractor",
  owner: {
    menu: { more: "More", chat: "Chat with CrewBrain", helpers: "My helpers", inbox: "Inbox", brain: "Brain", how: "How it works", switch: "Switch person (demo)", backChat: "Chat" },
    clock: { title: "Demo clock", advance: "Skip ahead 1 day", reset: "Reset clock", off: "The demo clock is turned off on this server.", now: "Now: {t}", wasReset: "Clock reset.", skipped: "Skipped ahead 1 day." },
    views: {
      brainTitle: "Brain", brainSub: "Everything you know, with a lock on every page.",
      helpersTitle: "Helpers", helpersSub: "Who can use each helper, and when it shuts off.",
      inboxTitle: "Inbox", inboxSub: "Questions and problems your helpers passed to you.",
    },
    create: {
      title: "What do you need?",
      intro: "Tap the yellow mic and say it like you'd tell your office manager. Make a helper, teach CrewBrain something, or ask what's new. Or tap one of these:",
      trySaying: "Try saying",
      suggestions: [
        "Make a helper for the Patels about their install, until 30 days after handover",
        "Brief Bay Roofing's crew for the Oak St job until the job closes Friday 6pm",
        "What's new from my helpers?",
        "Show my helpers",
        "Remember the side gate code is now 5520, crew only",
        "What do we tell customers about cleaning panels?",
      ],
      placeholder: "Type or tap the mic…", message: "Message", send: "Send", talk: "Tap and talk",
      attach: "Add a photo, file or voice note", photo: "Photo", file: "File", voiceNote: "Voice note",
    },
    toast: {
      loadAccount: "Couldn't load your account. Pull down or reload to try again.",
      sendFail: "That didn't go through. Check your signal and send it again.",
      sendRetry: "Couldn't send. Try again.", turnOnFail: "Couldn't turn it on. Try again in a moment.",
      linksFail: "Couldn't load the links. Try again.", brainFail: "Couldn't load your Brain. Try again in a moment.",
      relabelFail: "Couldn't change who can see this. Try again.", photoOpen: "Couldn't open that photo. Try taking it again.",
      photoRead: "Couldn't read that photo. Try again with better light.", saveFail: "Couldn't save. Try again.",
      closeFail: "Couldn't close it. Try again.", answerFail: "Couldn't send your answer. Try again.", dismissFail: "Couldn't dismiss it. Try again.",
    },
    voice: {
      connecting: "Getting ready…", helperReady: "Helper ready for your OK: {n}", replyDrafted: "Reply drafted to {to}",
      linksReady: "Links ready for {n}", yourHelper: "your helper", updatesWaiting: "{n} update(s) waiting for your approval",
      knowledgeDrafted: "Knowledge drafted for your OK", needsConfirm: "Needs your confirmation",
    },
    reply: { to: "Reply to {to}", via: "(via {via})", send: "Send", edit: "Edit", sending: "Sending…", sentTo: "Sent to {to}", brainImproved: "Brain improved: future questions like this will find your answer." },
    ac: {
      crewBriefing: "Crew briefing", homeownerHelper: "Homeowner helper", person1: "1 person", peopleN: "{n} people",
      changeHint: "e.g. end it Saturday instead", knows: "Knows", nothingYet: "Nothing yet", canDo: "Can do", onlyAnswer: "Only answer questions",
      questionsTo: "Questions go to {o}", you: "you", cantSee: "Can't see", nothingHeld: "Nothing held back", details: "Details",
      nobodyYet: "Nobody yet", live: "Live", whatChanged: "What changed", ends: "Ends {e}", liveReady: "Live. Links are ready to send.",
      sendAgain: "Send the links again", approve: "Approve and send links", change: "Change…", turningOn: "Turning it on…",
      liveUntil: "{n} is live until {e}", sendName: "Send {n}",
    },
    pill: { live: "Live", waiting: "Waiting for your OK", ended: "Ended" },
    brainTab: {
      snap: "Teach from a photo", empty: "Nothing here yet. Snap a photo of a warranty card or site note to teach CrewBrain.",
      updated: "Updated {d}", updatedWord: "updated", saveWho: "Save who can see this", nowVisible: "Now visible to: {l}", version: "Version {v}",
      whoSee: "Who can see this", yourPhoto: "Your photo", reading: "Reading your photo…", saveBrain: "Save to my Brain", saving: "Saving…",
      added: "Added: {t}", newKnowledge: "new knowledge", checkTitle: "Check what I read",
      checkText: "Check it and fix anything I got wrong. Helpers can't use it until you save it.", title: "Title", whatItSays: "What it says",
    },
    hc: {
      emptyA: "No helpers yet. Go back to ", emptyLink: "the chat", emptyB: " and say who needs one.", for: "For {a}", nobodyYet: "nobody yet",
      ended: "Ended {e}", shutsOff: "Shuts off {e}", sendLinks: "Send links", tryIt: "Try it", close: "Close this job", yesClose: "Yes, close it",
      cancel: "Cancel", closeQ: "Close {n}?", closeText: "Every link stops working right now. Anything you shared just for this job goes back to Office only.",
      closing: "Closing…", isOff: "{n} is off. The links no longer work.",
    },
    inbox: {
      kind: { question: "Question", issue: "Problem reported", walkthrough: "Wants a walkthrough", relay: "Update for the homeowner" },
      photo: "Photo", via: "via {a}", answered: "Answered", dismissed: "Dismissed", caughtUp: "All caught up.", nothingWaiting: "Nothing is waiting on you.",
      done: "Done", fromVia: "{f} via {a}", photoFrom: "Photo from {f}", answerPh: "Type your answer. The helper will know it next time too.",
      replyPh: "Type a reply or a note…", sendAnswer: "Send answer", dismiss: "Dismiss, no answer needed", sentSaved: "Sent. Also saved to your Brain: {t}",
      answerSent: "Answer sent.", yourAnswer: "Your answer", whoSeeAnswer: "Who can see this answer", alreadyAnswered: "You already answered this.", youDismissed: "You dismissed this.",
    },
    ob: {
      skip: "Skip", step: "{i} of {n}", start: "Start", next: "Next",
      s1Title: "Your company brain", s1Text: "Everything you know about your jobs, in one place. Every page has a lock, so you decide who can see it: just the office, your crew, or the homeowner.",
      s2Title: "Say who needs help", s2Text: "Tap the mic and talk like you'd tell your office manager: who it's for, what job, and until when. CrewBrain asks if anything is missing.",
      s3Title: "You approve, they get a link", s3Text: "Nothing goes live without your OK. Each person gets their own link, and it shuts off by itself when the job ends.",
    },
cards: {
      noReach: "Can't reach CrewBrain. Check your signal and try again.", yourHelper: "your helper", sendName: "Send {n}",
      copied: "Copied", holdToCopy: "Hold to copy", copy: "Copy", text: "Text", smsBody: "Here's your link for {n}: {url}",
      worksUntil: "Works until {e}", andMore: "and {n} more", noLinks: "No links yet. Approve the helper first.",
      sendEveryone: "Send to everyone", showQr: "Show QR codes",
      forWho: "For {a}", endedOn: "Ended {e}", endsOn: "Ends {e}", share: "Share", openChat: "Open chat", close: "Close",
      showAll: "Show all {n}", yourHelpers: "Your helpers", yourHelpersN: "Your helpers ({n})", noHelpers: "No helpers yet. Say who needs one.",
      yesDoIt: "Yes, do it", cancel: "Cancel", sure: "Are you sure?", cancelled: "Cancelled. Nothing changed.", working: "Working on it…",
      failed: "That didn't go through. Try again.", done: "Done", allDone: "All done.",
      checkBefore: "Check before saving", title: "Title", whatItSays: "What it says", untitled: "Untitled", edit: "Edit",
      saveToBrain: "Save to brain", yourPhoto: "Your photo", whoCanSee: "Who can see this", saving: "Saving…", saveFail: "Couldn't save. Try again.",
      savedLock: "Saved · {l}", saveThis: "Save this to your brain?",
      fromBrain: "From your brain", source: "Source", relatedGraph: "Related (from the knowledge graph)", related: "Related: {t}",
      source1: "1 source", sourcesN: "{n} sources", waitingOnYou: "Waiting on you", someone: "Someone",
      household: "household", messageTo: "Message to the {w}", approveSend: "Approve and send", notNow: "Not now",
      noLiveHelper: "The {w} has no live helper yet, so there's nowhere to send this. It stays in your inbox.",
      sendToQ: "Send to the {w}?", theCrew: "the crew", from: "From {f}", fromVia: "From {f} via {a}",
      messageTheyGet: "Message they'll get", nothingUntil: "Nothing reaches them until you approve.",
      sentToThe: "Sent to the {w}", sentTo: "Sent to {w}", notSent: "Not sent", sending: "Sending…", sendFail: "Couldn't send. Try again.",
      and: " and ", doFail: "Couldn't do that. Try again.", notSentNothing: "Not sent. Nothing reached the {w}.",
      photoOpenFail: "Couldn't open that photo. Try taking it again.", photo: "Photo", readingPhoto: "Reading your photo…",
      photoReadFail: "Couldn't read that photo. Try again with better light.", whatIRead: "Here's what I read",
      whoFile: "Who should be able to see this file?", uploading: "Uploading…", readingFile: "Reading the file…",
      fileFail: "Couldn't save that file. Try again.", noVoiceNotes: "Voice notes don't work in this browser. Type it instead.",
      needMic: "I need the microphone to record. Allow it and try again.", stopSave: "Stop and save",
      recording: "Recording a voice note", upTo1Min: "up to 1 minute", voiceNote: "Voice note · {t}",
      listening: "Listening to your note…", noteFail: "Couldn't understand that note. Try again or type it.", whatIHeard: "Here's what I heard",
    },
    brain: {
      title: "Your company brain", intro: "Everything your helpers can know. Each piece has a lock that decides who can find it.",
      foot: "Stored in your private HydraDB brain. Each lock decides who can find it.",
      drive: {
        connect: "Connect Google Drive", title: "Google Drive", demo: "Available in your own CrewBrain workspace",
        picking: "Connected. Pick the one folder CrewBrain should read.", pick: "Pick a Drive folder",
        pickIntro: "CrewBrain reads only this folder, and keeps it in sync.", noFolders: "No folders found in this Drive.",
        syncing: "Reading “{f}”… new files show up here in a few minutes.", active: "Syncing “{f}”: {n} files. Each starts as Office only.",
        error: "Drive stopped syncing. Connect it again.", fail: "Couldn't connect Google Drive. Try again.", picked: "Reading “{f}”",
        note: "Files shared with anyone or with a customer in Drive keep that sharing. Everything else in the folder starts as Office only: no helper uses a file until you relabel it.",
        warn: "Heads up: Drive's sharing couldn't be read for this folder ({w}). Until it can, the folder's Office-only rule applies.",
        fileWarn: "Heads up: Drive's sharing couldn't be read for this file ({w}).", open: "Open in Google Drive",
      },
      addKnowledge: "Add knowledge", snap: "Snap a photo", askPh: "Ask your brain — e.g. gate code, warranty", askAria: "Ask your brain", search: "Search",
      loadFail: "Couldn't load the brain.", empty: "Nothing here yet. Tap Add knowledge to teach CrewBrain.", updated: "Updated {d}",
      searching: "Searching…", searchFail: "Couldn't search.", noMatch: "Nothing in your brain matches that yet.",
      loading: "Loading…", textFail: "Couldn't load the text.", whoCanFind: "Who can find this",
      lockFail: "Couldn't change the lock.", locked: "Locked: {l}", added: "Added: {t}", newKnowledge: "new knowledge", note: "Note",
      lockSub: { internal: "Never leaves the office", crew: "The crews on your jobs", customer: "Customers and crews" },
      snapSub: "Warranty card, label, note", upload: "Upload a file", uploadSub: "PDF, Word, text, CSV",
      paste: "Paste or type", pasteSub: "Notes, answers, rules", record: "Record a voice note", recordSub: "Say it, we write it down",
      titleOptional: "Title (optional)", textPh: "Paste or type what your helpers should know", addToBrain: "Add to brain",
      typeFirst: "Type or paste something first.", saving: "Saving…", saveFail: "Couldn't save.", titleLabel: "Title", whatItSays: "What it says",
      readingFile: "Reading the file…", netErr: "Network error — check your connection.", fileFail: "Couldn't add that file.",
      recUnsupported: "Recording isn't supported here — type it instead.", startRec: "Start recording", micDenied: "Microphone permission was denied.",
      writing: "Writing it down…", transcribeFail: "Couldn't transcribe that.", checkHeard: "Check what I heard", stop: "Stop",
      recordHint: "Say what your helpers should know. You'll check the words before anything is saved.",
      photoFail: "Couldn't read that photo.", teachPhoto: "Teach from a photo", yourPhoto: "Your photo", readingPhoto: "Reading your photo…",
      approveInto: "Approve into Brain", checkRead: "Check what I read", notUsable: "Nothing is usable until you approve it.", tooBig: "That file is over 10 MB.",
    },
    common: {
      netErr: "Can't reach CrewBrain. Check your signal and try again.", close: "Close", thinking: "Thinking", section: "Section",
      origin: { drive: "From Google Drive", gmail: "From Gmail", photo: "Photo", answer: "Your answer", doc: "Document" },
      lock: {
        internal: "Office only", crew: "Crew", customer: "Homeowners",
        internalSub: "never leaves", crewSub: "job crew", customerSub: "customers", whoCanSee: "Who can see this",
      },
      share: {
        title: "Share links", none: "No links yet. Approve the helper first, then come back here.", yourHelper: "Your helper", ourTeam: "our team",
        msg: "Hi {first}, this is {owner} from {company}. {helper} can answer your questions about {job}: {url}",
        msgUntil: "Hi {first}, this is {owner} from {company}. {helper} can answer your questions about {job} until {ends}: {url}",
        subject: "{helper} from {company}", streetJob: "the {s} job", theJob: "the job", theX: "the {j}",
        qrAlt: "QR code for {n}'s link", onSite: "Show on site: {n}", scan: "Scan with your phone camera",
        allSent: "All sent", sendAll: "Send to everyone", next: "Next: {n}", copy: "Copy", copied: "Copied", holdCopy: "Hold link to copy",
        share: "Share…", shareAria: "Share {n}'s link", text: "Text", textAria: "Text {n}", email: "Email", emailAria: "Email {n}", qrAria: "Show QR for {n}",
        note: "Each link is personal. A forwarded link won't work for anyone else, and every link stops when the job closes.",
      },
      voice: {
        connecting: "Connecting…", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…",
        title: "Voice", end: "End", mute: "Mute", unmute: "Unmute", captions: "Captions", ended: "Voice ended", conversation: "Voice conversation",
        turn1: "1 turn", turnsN: "{n} turns", results: "Results", showTranscript: "Show transcript", hideTranscript: "Hide transcript",
        autoNote: "Automatic transcript; may differ slightly from what was said.", you: "You", helper: "Helper", source: "Source", loading: "Loading…",
        needsTap: "Needs your tap", ttfa: "Time to first audio", more: "+{n} more", talk: "Talk", stopTalking: "Stop talking",
        unavailable: "Voice isn't available right now. Type your message instead.", stopped: "Voice stopped. You can type instead.",
        startFail: "Couldn't start voice. Type your message instead.",
      },
    },
  },
};

export const ES = {
  ask: "Pregunta lo que quieras…", photoPh: "Di qué está mal…", send: "Enviar", talk: "Toca y habla", stopTalk: "Dejar de hablar",
  attach: "Añadir foto", report: "Reportar un problema", photoAttached: "Foto añadida", removePhoto: "Quitar foto",
  ends: "Funciona hasta", canDo: "También puede", endedTitle: "Este asistente terminó", ended: "terminado", theOwner: "El dueño",
  expired: "Este enlace dejó de funcionar {e}. Gracias por trabajar con {c}.",
  revoked: "{o} cerró este trabajo, así que este enlace ya no funciona. Gracias por trabajar con {c}.",
  lostTitle: "Abre tu enlace otra vez", lost: "Se cerró tu sesión en este teléfono. Toca el enlace personal que te enviaron para seguir.",
  notFound: "No se encontró el asistente", notFoundText: "Revisa el enlace que te enviaron o pregunta a quien te lo mandó.",
  missing: "A este enlace le falta parte de la dirección. Abre el enlace que te enviaron.",
  hi: "Hola {n}, soy {h} de {c}.", hiAnon: "Hola, soy {h} de {c}.",
  helpsWith: "Te ayudo con {j}.", worksUntil: "Funciono hasta {e}.",
  typeInstead: "Prefiero escribir", notShare: "No puedo compartir eso",
  source: "Fuente", foundIn: "Encontrado en", checking: "Revisando las notas…", source1: "1 fuente", sourcesN: "{n} fuentes",
  loading: "Cargando…", sendFail: "No se pudo enviar. Revisa tu señal e inténtalo otra vez.",
  aiDown: "El asistente de IA no está disponible ahora; esta respuesta viene tal cual de las notas de la empresa.",
  answered: "{o} respondió:", savedTo: "Guardado en el conocimiento de {c}",
  logged: "Enviado a {o}: ", walk: "Visita pedida a {o}: ",
  relayAsk: "Esperando la aprobación de {o}: ", relaySent: "Enviado a la familia: ", updateFrom: "Aviso de {c}",
  photoFail: "No se pudo abrir la foto. Tómala otra vez.", herePhoto: "Aquí va una foto.",
  voiceErr: "La voz no está disponible ahora. Escribe tu mensaje.",
  language: "Idioma", auto: "Automático", other: "Otro…", otherPrompt: "Código de idioma (por ejemplo nl, sw, pt-BR)",
  vs: { connecting: "Preparando…", listening: "Escuchando…", thinking: "Pensando…", speaking: "Hablando…" },
  vo: {
    title: "Voz", end: "Terminar", mute: "Silenciar", unmute: "Activar micrófono", captions: "Subtítulos", ended: "Llamada de voz terminada",
    conversation: "Conversación de voz", turn1: "1 turno", turnsN: "{n} turnos", results: "Resultados",
    showTranscript: "Ver transcripción", hideTranscript: "Ocultar transcripción",
    autoNote: "Transcripción automática; puede diferir un poco de lo que se dijo.", you: "Tú", needsTap: "Necesita tu toque", ttfa: "Tiempo hasta el primer audio",
  },
  crew: ["¿Cuál es el código del portón?", "¿Dónde nos estacionamos?", "¿Cuál es el horario de hoy?"],
  home: ["¿Mi refrigerador seguirá funcionando en un apagón?", "¿Cuándo es la inspección?", "¿Podemos añadir otra batería después?"],
  company: "tu contratista",
  owner: {
    menu: { more: "Más", chat: "Hablar con CrewBrain", helpers: "Mis asistentes", inbox: "Bandeja", brain: "Cerebro", how: "Cómo funciona", switch: "Cambiar de persona (demo)", backChat: "Chat" },
    clock: { title: "Reloj de demo", advance: "Adelantar 1 día", reset: "Reiniciar reloj", off: "El reloj de demo está apagado en este servidor.", now: "Ahora: {t}", wasReset: "Reloj reiniciado.", skipped: "Se adelantó 1 día." },
    views: {
      brainTitle: "Cerebro", brainSub: "Todo lo que sabes, con un candado en cada página.",
      helpersTitle: "Asistentes", helpersSub: "Quién puede usar cada asistente y cuándo se apaga.",
      inboxTitle: "Bandeja", inboxSub: "Preguntas y problemas que tus asistentes te pasaron.",
    },
    create: {
      title: "¿Qué necesitas?",
      intro: "Toca el micrófono amarillo y dilo como se lo dirías a tu encargado de oficina. Crea un asistente, enséñale algo a CrewBrain o pregunta qué hay de nuevo. O toca una de estas:",
      trySaying: "Prueba a decir",
      suggestions: [
        "Crea un asistente para los Patel sobre su instalación, hasta 30 días después de la entrega",
        "Informa al equipo de Bay Roofing sobre la obra de Oak St hasta que cierre el viernes a las 6 pm",
        "¿Qué hay de nuevo de mis asistentes?",
        "Muestra mis asistentes",
        "Recuerda que el código del portón lateral ahora es 5520, solo para el equipo",
        "¿Qué les decimos a los clientes sobre limpiar los paneles?",
      ],
      placeholder: "Escribe o toca el micrófono…", message: "Mensaje", send: "Enviar", talk: "Toca y habla",
      attach: "Añadir foto, archivo o nota de voz", photo: "Foto", file: "Archivo", voiceNote: "Nota de voz",
    },
    toast: {
      loadAccount: "No se pudo cargar tu cuenta. Desliza hacia abajo o recarga para intentarlo de nuevo.",
      sendFail: "No se pudo enviar. Revisa tu señal e inténtalo otra vez.",
      sendRetry: "No se pudo enviar. Inténtalo otra vez.", turnOnFail: "No se pudo activar. Inténtalo en un momento.",
      linksFail: "No se pudieron cargar los enlaces. Inténtalo otra vez.", brainFail: "No se pudo cargar tu Cerebro. Inténtalo en un momento.",
      relabelFail: "No se pudo cambiar quién puede verlo. Inténtalo otra vez.", photoOpen: "No se pudo abrir la foto. Tómala otra vez.",
      photoRead: "No se pudo leer la foto. Inténtalo con mejor luz.", saveFail: "No se pudo guardar. Inténtalo otra vez.",
      closeFail: "No se pudo cerrar. Inténtalo otra vez.", answerFail: "No se pudo enviar tu respuesta. Inténtalo otra vez.", dismissFail: "No se pudo descartar. Inténtalo otra vez.",
    },
    voice: {
      connecting: "Preparando…", helperReady: "Asistente listo para tu aprobación: {n}", replyDrafted: "Respuesta redactada para {to}",
      linksReady: "Enlaces listos para {n}", yourHelper: "tu asistente", updatesWaiting: "{n} aviso(s) esperando tu aprobación",
      knowledgeDrafted: "Conocimiento redactado para tu aprobación", needsConfirm: "Necesita tu confirmación",
    },
    reply: { to: "Responder a {to}", via: "(vía {via})", send: "Enviar", edit: "Editar", sending: "Enviando…", sentTo: "Enviado a {to}", brainImproved: "Cerebro mejorado: preguntas como esta encontrarán tu respuesta." },
    ac: {
      crewBriefing: "Briefing del equipo", homeownerHelper: "Asistente para la familia", person1: "1 persona", peopleN: "{n} personas",
      changeHint: "p. ej. que termine el sábado", knows: "Sabe", nothingYet: "Nada todavía", canDo: "Puede", onlyAnswer: "Solo responder preguntas",
      questionsTo: "Las preguntas van a {o}", you: "ti", cantSee: "No ve", nothingHeld: "No se oculta nada", details: "Detalles",
      nobodyYet: "Nadie todavía", live: "Activo", whatChanged: "Qué cambió", ends: "Termina {e}", liveReady: "Activo. Los enlaces están listos para enviar.",
      sendAgain: "Enviar los enlaces otra vez", approve: "Aprobar y enviar enlaces", change: "Cambiar…", turningOn: "Activando…",
      liveUntil: "{n} está activo hasta {e}", sendName: "Enviar {n}",
    },
    pill: { live: "Activo", waiting: "Esperando tu aprobación", ended: "Terminado" },
    brainTab: {
      snap: "Enseñar con una foto", empty: "Aún no hay nada. Toma una foto de una tarjeta de garantía o una nota de obra para enseñarle a CrewBrain.",
      updated: "Actualizado {d}", updatedWord: "actualizado", saveWho: "Guardar quién puede verlo", nowVisible: "Ahora visible para: {l}", version: "Versión {v}",
      whoSee: "Quién puede verlo", yourPhoto: "Tu foto", reading: "Leyendo tu foto…", saveBrain: "Guardar en mi Cerebro", saving: "Guardando…",
      added: "Añadido: {t}", newKnowledge: "conocimiento nuevo", checkTitle: "Revisa lo que leí",
      checkText: "Revísalo y corrige lo que haya leído mal. Los asistentes no pueden usarlo hasta que lo guardes.", title: "Título", whatItSays: "Lo que dice",
    },
    hc: {
      emptyA: "Aún no hay asistentes. Vuelve a ", emptyLink: "el chat", emptyB: " y di quién necesita uno.", for: "Para {a}", nobodyYet: "nadie todavía",
      ended: "Terminó {e}", shutsOff: "Se apaga {e}", sendLinks: "Enviar enlaces", tryIt: "Probar", close: "Cerrar este trabajo", yesClose: "Sí, cerrarlo",
      cancel: "Cancelar", closeQ: "¿Cerrar {n}?", closeText: "Todos los enlaces dejan de funcionar ahora mismo. Lo que compartiste solo para este trabajo vuelve a ser solo de la oficina.",
      closing: "Cerrando…", isOff: "{n} está apagado. Los enlaces ya no funcionan.",
    },
    inbox: {
      kind: { question: "Pregunta", issue: "Problema reportado", walkthrough: "Quiere una visita", relay: "Aviso para la familia" },
      photo: "Foto", via: "vía {a}", answered: "Respondido", dismissed: "Descartado", caughtUp: "Todo al día.", nothingWaiting: "No hay nada pendiente.",
      done: "Hecho", fromVia: "{f} vía {a}", photoFrom: "Foto de {f}", answerPh: "Escribe tu respuesta. El asistente también la sabrá la próxima vez.",
      replyPh: "Escribe una respuesta o una nota…", sendAnswer: "Enviar respuesta", dismiss: "Descartar, no hace falta responder", sentSaved: "Enviado. También se guardó en tu Cerebro: {t}",
      answerSent: "Respuesta enviada.", yourAnswer: "Tu respuesta", whoSeeAnswer: "Quién puede ver esta respuesta", alreadyAnswered: "Ya respondiste esto.", youDismissed: "Descartaste esto.",
    },
    ob: {
      skip: "Saltar", step: "{i} de {n}", start: "Empezar", next: "Siguiente",
      s1Title: "El cerebro de tu empresa", s1Text: "Todo lo que sabes de tus trabajos, en un solo lugar. Cada página tiene un candado, así que tú decides quién la ve: solo la oficina, tu equipo o la familia.",
      s2Title: "Di quién necesita ayuda", s2Text: "Toca el micrófono y habla como se lo dirías a tu encargado de oficina: para quién es, qué trabajo y hasta cuándo. CrewBrain pregunta si falta algo.",
      s3Title: "Tú apruebas, ellos reciben un enlace", s3Text: "Nada se activa sin tu aprobación. Cada persona recibe su propio enlace, y se apaga solo cuando termina el trabajo.",
    },
cards: {
      noReach: "No se puede conectar con CrewBrain. Revisa tu señal e inténtalo otra vez.", yourHelper: "tu asistente", sendName: "Enviar {n}",
      copied: "Copiado", holdToCopy: "Mantén pulsado para copiar", copy: "Copiar", text: "SMS", smsBody: "Aquí está tu enlace para {n}: {url}",
      worksUntil: "Funciona hasta {e}", andMore: "y {n} más", noLinks: "Aún no hay enlaces. Primero aprueba el asistente.",
      sendEveryone: "Enviar a todos", showQr: "Mostrar códigos QR",
      forWho: "Para {a}", endedOn: "Terminó {e}", endsOn: "Termina {e}", share: "Compartir", openChat: "Abrir chat", close: "Cerrar",
      showAll: "Ver los {n}", yourHelpers: "Tus asistentes", yourHelpersN: "Tus asistentes ({n})", noHelpers: "Aún no hay asistentes. Di quién necesita uno.",
      yesDoIt: "Sí, hazlo", cancel: "Cancelar", sure: "¿Seguro?", cancelled: "Cancelado. No cambió nada.", working: "Trabajando en ello…",
      failed: "No se pudo completar. Inténtalo otra vez.", done: "Listo", allDone: "Todo listo.",
      checkBefore: "Revisa antes de guardar", title: "Título", whatItSays: "Qué dice", untitled: "Sin título", edit: "Editar",
      saveToBrain: "Guardar en el cerebro", yourPhoto: "Tu foto", whoCanSee: "Quién puede verlo", saving: "Guardando…", saveFail: "No se pudo guardar. Inténtalo otra vez.",
      savedLock: "Guardado · {l}", saveThis: "¿Guardar esto en tu cerebro?",
      fromBrain: "De tu cerebro", source: "Fuente", relatedGraph: "Relacionado (del grafo de conocimiento)", related: "Relacionado: {t}",
      source1: "1 fuente", sourcesN: "{n} fuentes", waitingOnYou: "Esperando tu respuesta", someone: "Alguien",
      household: "familia", messageTo: "Mensaje para la {w}", approveSend: "Aprobar y enviar", notNow: "Ahora no",
      noLiveHelper: "La {w} aún no tiene un asistente activo, así que no hay adónde enviarlo. Se queda en tu bandeja.",
      sendToQ: "¿Enviar a la {w}?", theCrew: "el equipo", from: "De {f}", fromVia: "De {f} vía {a}",
      messageTheyGet: "Mensaje que recibirán", nothingUntil: "No les llega nada hasta que lo apruebes.",
      sentToThe: "Enviado a la {w}", sentTo: "Enviado a {w}", notSent: "No enviado", sending: "Enviando…", sendFail: "No se pudo enviar. Inténtalo otra vez.",
      and: " y ", doFail: "No se pudo hacer. Inténtalo otra vez.", notSentNothing: "No enviado. No le llegó nada a la {w}.",
      photoOpenFail: "No se pudo abrir la foto. Tómala otra vez.", photo: "Foto", readingPhoto: "Leyendo tu foto…",
      photoReadFail: "No se pudo leer la foto. Inténtalo con mejor luz.", whatIRead: "Esto es lo que leí",
      whoFile: "¿Quién debería poder ver este archivo?", uploading: "Subiendo…", readingFile: "Leyendo el archivo…",
      fileFail: "No se pudo guardar el archivo. Inténtalo otra vez.", noVoiceNotes: "Las notas de voz no funcionan en este navegador. Escríbelo.",
      needMic: "Necesito el micrófono para grabar. Permítelo e inténtalo otra vez.", stopSave: "Detener y guardar",
      recording: "Grabando una nota de voz", upTo1Min: "hasta 1 minuto", voiceNote: "Nota de voz · {t}",
      listening: "Escuchando tu nota…", noteFail: "No entendí la nota. Inténtalo otra vez o escríbela.", whatIHeard: "Esto es lo que escuché",
    },
    brain: {
      title: "El cerebro de tu empresa", intro: "Todo lo que tus asistentes pueden saber. Cada parte tiene un candado que decide quién puede encontrarla.",
      foot: "Guardado en tu cerebro privado de HydraDB. Cada candado decide quién puede encontrarlo.",
      drive: {
        connect: "Conectar Google Drive", title: "Google Drive", demo: "Disponible en tu propio espacio de CrewBrain",
        picking: "Conectado. Elige la carpeta que CrewBrain debe leer.", pick: "Elegir una carpeta de Drive",
        pickIntro: "CrewBrain lee solo esta carpeta y la mantiene al día.", noFolders: "No hay carpetas en este Drive.",
        syncing: "Leyendo “{f}”… los archivos nuevos aparecen aquí en unos minutos.", active: "Sincronizando “{f}”: {n} archivos. Cada uno empieza como Solo oficina.",
        error: "Drive dejó de sincronizar. Conéctalo de nuevo.", fail: "No se pudo conectar Google Drive. Inténtalo de nuevo.", picked: "Leyendo “{f}”",
        note: "Los archivos compartidos con cualquiera o con un cliente en Drive conservan ese permiso. Todo lo demás en la carpeta empieza como Solo oficina: ningún asistente usa un archivo hasta que cambies su candado.",
        warn: "Atención: no se pudo leer cómo se comparte esta carpeta en Drive ({w}). Mientras tanto se aplica la regla Solo oficina de la carpeta.",
        fileWarn: "Atención: no se pudo leer cómo se comparte este archivo en Drive ({w}).", open: "Abrir en Google Drive",
      },
      addKnowledge: "Añadir conocimiento", snap: "Tomar una foto", askPh: "Pregúntale a tu cerebro — p. ej. código del portón, garantía", askAria: "Pregúntale a tu cerebro", search: "Buscar",
      loadFail: "No se pudo cargar el cerebro.", empty: "Aún no hay nada. Toca Añadir conocimiento para enseñarle a CrewBrain.", updated: "Actualizado {d}",
      searching: "Buscando…", searchFail: "No se pudo buscar.", noMatch: "Nada en tu cerebro coincide con eso todavía.",
      loading: "Cargando…", textFail: "No se pudo cargar el texto.", whoCanFind: "Quién puede encontrarlo",
      lockFail: "No se pudo cambiar el candado.", locked: "Candado: {l}", added: "Añadido: {t}", newKnowledge: "nuevo conocimiento", note: "Nota",
      lockSub: { internal: "Nunca sale de la oficina", crew: "Las cuadrillas de tus trabajos", customer: "Clientes y cuadrillas" },
      snapSub: "Tarjeta de garantía, etiqueta, nota", upload: "Subir un archivo", uploadSub: "PDF, Word, texto, CSV",
      paste: "Pegar o escribir", pasteSub: "Notas, respuestas, reglas", record: "Grabar una nota de voz", recordSub: "Dilo y lo escribimos",
      titleOptional: "Título (opcional)", textPh: "Pega o escribe lo que tus asistentes deben saber", addToBrain: "Añadir al cerebro",
      typeFirst: "Primero escribe o pega algo.", saving: "Guardando…", saveFail: "No se pudo guardar.", titleLabel: "Título", whatItSays: "Lo que dice",
      readingFile: "Leyendo el archivo…", netErr: "Error de red — revisa tu conexión.", fileFail: "No se pudo añadir ese archivo.",
      recUnsupported: "Aquí no se puede grabar — escríbelo.", startRec: "Empezar a grabar", micDenied: "Se negó el permiso del micrófono.",
      writing: "Escribiéndolo…", transcribeFail: "No se pudo transcribir.", checkHeard: "Revisa lo que escuché", stop: "Detener",
      recordHint: "Di lo que tus asistentes deben saber. Revisarás las palabras antes de guardar nada.",
      photoFail: "No se pudo leer esa foto.", teachPhoto: "Enseñar con una foto", yourPhoto: "Tu foto", readingPhoto: "Leyendo tu foto…",
      approveInto: "Aprobar en el cerebro", checkRead: "Revisa lo que leí", notUsable: "Nada se puede usar hasta que lo apruebes.", tooBig: "Ese archivo pesa más de 10 MB.",
    },
    common: {
      netErr: "No se puede conectar con CrewBrain. Revisa tu señal e inténtalo otra vez.", close: "Cerrar", thinking: "Pensando", section: "Sección",
      origin: { drive: "De Google Drive", gmail: "De Gmail", photo: "Foto", answer: "Tu respuesta", doc: "Documento" },
      lock: {
        internal: "Solo oficina", crew: "Cuadrilla", customer: "Propietarios",
        internalSub: "nunca sale", crewSub: "cuadrilla del trabajo", customerSub: "clientes", whoCanSee: "Quién puede verlo",
      },
      share: {
        title: "Compartir enlaces", none: "Aún no hay enlaces. Aprueba primero el asistente y luego vuelve aquí.", yourHelper: "Tu asistente", ourTeam: "nuestro equipo",
        msg: "Hola {first}, soy {owner} de {company}. {helper} puede responder tus preguntas sobre {job}: {url}",
        msgUntil: "Hola {first}, soy {owner} de {company}. {helper} puede responder tus preguntas sobre {job} hasta {ends}: {url}",
        subject: "{helper} de {company}", streetJob: "el trabajo de {s}", theJob: "el trabajo", theX: "{j}",
        qrAlt: "Código QR del enlace de {n}", onSite: "Mostrar en obra: {n}", scan: "Escanea con la cámara del teléfono",
        allSent: "Todo enviado", sendAll: "Enviar a todos", next: "Siguiente: {n}", copy: "Copiar", copied: "Copiado", holdCopy: "Mantén el enlace para copiar",
        share: "Compartir…", shareAria: "Compartir el enlace de {n}", text: "SMS", textAria: "Enviar SMS a {n}", email: "Correo", emailAria: "Enviar correo a {n}", qrAria: "Mostrar QR de {n}",
        note: "Cada enlace es personal. Un enlace reenviado no funciona para nadie más, y todos dejan de funcionar cuando se cierra el trabajo.",
      },
      voice: {
        connecting: "Conectando…", listening: "Escuchando…", thinking: "Pensando…", speaking: "Hablando…",
        title: "Voz", end: "Terminar", mute: "Silenciar", unmute: "Activar micrófono", captions: "Subtítulos", ended: "Llamada de voz terminada", conversation: "Conversación de voz",
        turn1: "1 turno", turnsN: "{n} turnos", results: "Resultados", showTranscript: "Ver transcripción", hideTranscript: "Ocultar transcripción",
        autoNote: "Transcripción automática; puede diferir un poco de lo que se dijo.", you: "Tú", helper: "Asistente", source: "Fuente", loading: "Cargando…",
        needsTap: "Necesita tu toque", ttfa: "Tiempo hasta el primer audio", more: "+{n} más", talk: "Hablar", stopTalking: "Dejar de hablar",
        unavailable: "La voz no está disponible ahora. Escribe tu mensaje.", stopped: "La voz se detuvo. Puedes escribir.",
        startFail: "No se pudo iniciar la voz. Escribe tu mensaje.",
      },
    },
  },
};

/** The language picker, by BCP-47 code, each in its own name. */
export const LANGS = [
  ["en", "English"], ["es", "Español"], ["zh", "中文"], ["vi", "Tiếng Việt"], ["pt", "Português"], ["fr", "Français"],
  ["ko", "한국어"], ["tl", "Tagalog"], ["ru", "Русский"], ["ar", "العربية"], ["hi", "हिन्दी"], ["de", "Deutsch"],
  ["ja", "日本語"], ["pl", "Polski"], ["it", "Italiano"], ["uk", "Українська"],
];
export const RTL = ["ar", "he", "fa", "ur"];

export const fmt = (s, vars = {}) => String(s ?? "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "")).replace(/\s+([.,])/g, "$1").replace(/ {2,}/g, " ");

/** The picked language: "auto" (or nothing) follows the browser. */
export function pickedLang(raw) {
  const v = (raw || "auto").trim();
  return v === "auto" ? (navigator.languages?.[0] || navigator.language || "en") : v;
}
/** Base code ("pt-BR" → "pt"), lower-case. */
export const baseLang = (l) => String(l || "en").toLowerCase().split(/[-_]/)[0];

/** Bump when the table gains sections so per-browser caches refetch. Keep in step with src/i18n.ts. */
export const I18N_VERSION = 2;

/** Load the UI table for a language: EN/ES ship statically; others come from the server, cached per browser. */
export async function loadTable(lang) {
  const b = baseLang(lang);
  if (b === "en") return EN;
  if (b === "es") return ES;
  const key = `cb.i18n.v${I18N_VERSION}.${lang}`;
  try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c && c.ask && c.owner) return merge(EN, c); } catch { /* storage off */ }
  try {
    const r = await fetch(`api/i18n/${encodeURIComponent(lang)}`, { credentials: "same-origin" });
    if (r.ok) {
      const j = await r.json();
      if (j?.strings?.ask && j.strings.owner) {
        if (j.lang && baseLang(j.lang) !== "en") try { localStorage.setItem(key, JSON.stringify(j.strings)); } catch { /* storage off */ }
        return merge(EN, j.strings);
      }
    }
  } catch { /* offline */ }
  return EN;
}
function merge(base, over) {
  const out = {};
  for (const k of Object.keys(base)) {
    const b = base[k], o = over?.[k];
    if (Array.isArray(b)) out[k] = Array.isArray(o) && o.length === b.length && o.every((x) => typeof x === "string") ? o : b;
    else if (b && typeof b === "object") out[k] = merge(b, o);
    else out[k] = typeof o === "string" && o ? o : b;
  }
  return out;
}

/* ---------- owner UI: ot("key.path", vars) reads the loaded table's owner section ---------- */
let OWN = EN.owner, LOC = "en";
/** Install the loaded table (from loadTable) for the owner UI; `lang` drives date formatting. */
export function setOwnerStrings(tbl, lang) { OWN = tbl?.owner || EN.owner; LOC = lang || "en"; }
const dig = (o, path) => path.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
/** An owner string by dotted key, {placeholders} filled. Falls back to English, then the key. Arrays come back as-is. */
export function ot(path, vars) {
  const v = dig(OWN, path) ?? dig(EN.owner, path);
  return typeof v === "string" ? fmt(v, vars) : Array.isArray(v) ? v : path;
}
/** The owner UI's locale ("en" by default). */
export const ownerLocale = () => LOC;
/** A date/time in the owner's language and the company time zone; `fallback` (the server's English label) when unusable. */
export function fmtWhen(iso, tz, fallback = "", opts) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return fallback || "";
  if (baseLang(LOC) === "en" && fallback) return fallback;
  try {
    return new Intl.DateTimeFormat(LOC, { ...(tz ? { timeZone: tz } : {}), ...(opts || { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) }).format(d);
  } catch { return fallback || d.toISOString(); }
}

/** Apply <html lang> and direction. */
export function applyDocLang(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.includes(baseLang(lang)) ? "rtl" : "ltr";
}

/** A <select> language picker: Auto + LANGS + Other…; calls onPick(rawValue) where rawValue is "auto" or a code. */
export function langPicker(current, onPick, { label = "Language", auto = "Auto", other = "Other…", otherPrompt = "Language code" } = {}) {
  const sel = document.createElement("select");
  sel.className = "lang-select"; sel.setAttribute("aria-label", label);
  const opt = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; return o; };
  sel.append(opt("auto", auto));
  for (const [v, t] of LANGS) sel.append(opt(v, t));
  const cur = current || "auto";
  if (cur !== "auto" && !LANGS.some(([v]) => v === cur)) sel.append(opt(cur, cur));
  sel.append(opt("__other", other));
  sel.value = cur;
  sel.addEventListener("change", () => {
    let v = sel.value;
    if (v === "__other") {
      const got = (prompt(otherPrompt) || "").trim();
      if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(got)) { sel.value = cur; return; }
      v = got;
    }
    onPick(v);
  });
  return sel;
}
