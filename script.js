/*
  script.js - Chatbot assistant (vanilla JS, fetch)

  CONFIGURATION (set these before using):
  - GEMINI_API_KEY: your API key (if your API uses Bearer token)
  - GEMINI_ENDPOINT: the full URL to call (may require an API key query param)

  NOTES:
  - Many Gemini/Generative endpoints require a server-side proxy because of CORS and to keep keys secret.
  - Example Google Generative API endpoint (client must not expose key publicly):
      https://generativelanguage.googleapis.com/v1beta2/models/gemini-1.5-flash:generateText?key=YOUR_KEY
    The request format and response shape differ between providers; adjust parse logic below if needed.
*/

// === Configuration - EDIT THESE ===
const GEMINI_ENDPOINT = ""; // e.g. "https://generativelanguage.googleapis.com/v1beta2/models/gemini-1.5-flash:generateText?key=YOUR_KEY"
const GEMINI_API_KEY = ""; // If your endpoint expects Authorization: Bearer <key>
// ================================

// UI elements
const chatToggle = document.getElementById('chatToggle');
const chatContainer = document.getElementById('chatContainer');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const closeChat = document.getElementById('closeChat');

let isOpen = false;
let isSending = false;

function openChat() {
  chatContainer.style.display = 'block';
  chatToggle.setAttribute('aria-expanded','true');
  isOpen = true;
  chatInput.focus();
}

function closeChatWindow() {
  chatContainer.style.display = 'none';
  chatToggle.setAttribute('aria-expanded','false');
  isOpen = false;
}

chatToggle.addEventListener('click', () => {
  if (!isOpen) openChat(); else closeChatWindow();
});
closeChat.addEventListener('click', () => closeChatWindow());

// Send on Enter
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendCurrentMessage();
  }
});
sendBtn.addEventListener('click', sendCurrentMessage);

function appendMessage(text, who = 'bot') {
  const div = document.createElement('div');
  div.className = 'msg ' + (who === 'user' ? 'user' : 'bot');
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendTyping() {
  const div = document.createElement('div');
  div.className = 'msg bot typing';
  div.id = 'typingIndicator';
  div.textContent = 'Escribiendo...';
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function sendCurrentMessage() {
  const text = chatInput.value.trim();
  if (!text || isSending) return;
  chatInput.value = '';
  appendMessage(text, 'user');
  isSending = true;
  appendTyping();
  sendToGemini(text)
    .then(reply => {
      removeTyping();
      appendMessage(reply || 'Lo siento, no obtuve respuesta.');
    })
    .catch(err => {
      removeTyping();
      appendMessage('Error: ' + (err.message || 'falló la petición'));
      console.error(err);
    })
    .finally(() => { isSending = false; });
}

async function sendToGemini(message) {
  if (!GEMINI_ENDPOINT) {
    throw new Error('GEMINI_ENDPOINT no está configurado en script.js');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (GEMINI_API_KEY) {
    headers['Authorization'] = 'Bearer ' + GEMINI_API_KEY;
  }

  /*
    Body: We use a generic body { input: message } by default.
    If you need to use a provider-specific format (e.g. Google Generative Language), replace
    the body with the shape required by that API.
  */
  let body = { input: message };

  // Quick heuristic: if endpoint looks like Google Generative Language, use a sample body
  if (GEMINI_ENDPOINT.includes('generativelanguage.googleapis.com')) {
    body = {
      "prompt": {
        "text": message
      },
      // Adjust parameters as needed
      "temperature": 0.2,
      "max_output_tokens": 512
    };
  }

  const res = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Respuesta del servidor: ' + res.status + ' ' + text);
  }

  // Try to parse JSON, but fall back to plain text
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    // Try common response shapes
    // 1) Google GL: might have 'candidates' or 'outputs'
    if (json.candidates && Array.isArray(json.candidates) && json.candidates.length) {
      // candidates might be strings or objects
      const c = json.candidates[0];
      if (typeof c === 'string') return c;
      // some formats: {content: [{type: 'output_text', text: '...'}]}
      if (c.content) {
        if (typeof c.content === 'string') return c.content;
        if (Array.isArray(c.content)) {
          // attempt to pull text fields
          for (const part of c.content) {
            if (part.text) return part.text;
          }
        }
      }
      if (c.output) return String(c.output);
    }

    // 2) Vertex AI / other: may have 'predictions' or 'outputText'
    if (json.outputText) return json.outputText;
    if (json.output && typeof json.output === 'string') return json.output;
    if (json.predictions && Array.isArray(json.predictions)) {
      return String(json.predictions.map(p => (p.text || p)).join('\n'));
    }

    // 3) If provider returns simple field like 'text' or 'message'
    if (json.text) return String(json.text);
    if (json.message) return String(json.message);

    // 4) As a last resort, return the stringified JSON
    return JSON.stringify(json, null, 2);
  } catch (e) {
    // Not JSON — return raw text
    return text;
  }
}

// Small welcome message
(function init() {
  // Add an initial bot message when opened first
  const welcome = 'Hola, soy tu asistente. Pregúntame algo o pide ayuda con tu perfil.';
  appendMessage(welcome, 'bot');
})();
