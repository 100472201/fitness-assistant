import React, { useState, useEffect, useRef } from 'react';
import './index.css';

// ── CONSTANTS ──────────────────────────────────────────────────
const DAY_NAMES = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const DAY_NAMES_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const SYSTEM_PROMPT = `Eres mi asistente personal de entrenamiento, planificación y seguimiento semanal. Ayúdame a organizar mis entrenamientos y a revisar rutinas concretas de forma práctica, flexible y útil.

Mis objetivos:
- prioridad principal: ganar músculo, sobre todo en tren superior
- mantener y mejorar cardio
- seguir corriendo para hacer 10 km con buena forma y sin dolor
- compatibilizarlo con escalada

Actividades: empuje (pecho, hombro, tríceps), tirón (espalda, bíceps), pierna, core, running, escalada.

Reglas:
- cuando corro, normalmente no hago gym ese día
- escalada y espalda-bíceps no deben ir muy pegados
- escalo como mucho 1 vez por semana
- suelo entrenar 4–5 días por semana
- la planificación debe adaptarse a la fatiga real y a lo que ya he hecho esa semana

Estructura general deseada:
- 2 estímulos de empuje por semana
- 1 tirón en gym (la escalada puede contar como segundo estímulo de tirón)
- 1 día de pierna
- 1–2 días de running
- descanso cuando haga falta

Bíceps: frecuencia 2 semanal, 8–10 series efectivas por semana, repartir en dos días, combinar curls con sesgo en extensión, flexión y neutro/prono.

Tirón bien estructurado: tirón vertical principal, remo principal, tirón secundario opcional, face pulls o deltoide posterior, bíceps directo.
Empuje bien estructurado: press principal, segundo trabajo de pecho, hombro (sobre todo lateral), tríceps.
Pierna: 1 día sólido, sin perjudicar demasiado al running.
Running: mínimo 1 día/semana, idealmente 2; si hay 2: uno suave y otro más vivo.

Cuando te pase una rutina o sesión:
- analízala en el contexto de la semana
- revisa ejercicios, orden, series, reps y redundancia
- dime si la harías tal cual o la ajustarías
- dame una valoración del 1 al 10 según lo adecuada que sea para ese momento
- explica brevemente la nota
- dame sugerencias concretas de mejora

Cuando recibes un bloque [CONTEXTO SEMANA ...] al inicio del mensaje, úsalo activamente:
- mira qué días quedan libres
- detecta qué estímulos faltan o sobran
- estima la fatiga acumulada
- ajusta cualquier recomendación a lo que ya se ha hecho
- si faltan bíceps, dilo; si hay demasiado empuje, dilo

Sé claro, práctico y útil. No quiero teoría vacía. Usa formato markdown limpio: negritas para lo importante, listas claras, encabezados breves cuando estructures una sesión. Cuando puntúes del 1 al 10, escríbelo como **Valoración: X/10**.`;

// ── HELPERS ────────────────────────────────────────────────────
function getMondayOfWeek(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function getWeekDates(offset = 0) {
  const mon = getMondayOfWeek(offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

function isToday(d) {
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

const tagLabel = (a) => ({
  empuje: 'Empuje', tiron: 'Tirón', pierna: 'Pierna',
  running: 'Running', escalada: 'Escalada', core: 'Core', descanso: 'Descanso'
}[a] || a);

// ── COMPONENTS ─────────────────────────────────────────────────

export default function App() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekData, setWeekData] = useState({});
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userInput, setUserInput] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(null);
  const [modalIdx, setModalIdx] = useState(0);
  const [modalDate, setModalDate] = useState(null);
  const [modalActivities, setModalActivities] = useState([]);
  const [modalNotes, setModalNotes] = useState('');

  const chatWrapRef = useRef(null);

  // Load week statistics for display
  const stats = (() => {
    let active = 0, empuje = 0, tiron = 0, run = 0, biceps = 0;
    Object.values(weekData).forEach(entry => {
      const acts = entry.activities || [];
      if (acts.length > 0 && !acts.includes('descanso')) active++;
      if (acts.includes('empuje')) empuje++;
      if (acts.includes('tiron') || acts.includes('escalada')) tiron++; // escalation counts as pull
      if (acts.includes('running')) run++;
      if (acts.includes('tiron') || acts.includes('empuje')) biceps++; // proxy
    });
    return { active, empuje, tiron, run, biceps };
  })();

  // Effects
  useEffect(() => {
    const key = `week:${dateKey(getMondayOfWeek(weekOffset))}`;
    const saved = localStorage.getItem(key);
    setWeekData(saved ? JSON.parse(saved) : {});
  }, [weekOffset]);

  useEffect(() => {
    if (chatWrapRef.current) {
      chatWrapRef.current.scrollTop = chatWrapRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Handlers
  const handleOpenModal = (key, idx, date) => {
    setModalKey(key);
    setModalIdx(idx);
    setModalDate(date);
    const entry = weekData[key] || {};
    setModalActivities(entry.activities || []);
    setModalNotes(entry.notes || '');
    setIsModalOpen(true);
  };

  const handleToggleActivity = (name) => {
    if (name === 'descanso') {
      setModalActivities(prev => prev.includes('descanso') ? [] : ['descanso']);
    } else {
      setModalActivities(prev => {
        const next = prev.filter(a => a !== 'descanso');
        return next.includes(name) ? next.filter(a => a !== name) : [...next, name];
      });
    }
  };

  const handleSaveDay = () => {
    const nextData = { ...weekData };
    if (modalActivities.length === 0 && !modalNotes.trim()) {
      delete nextData[modalKey];
    } else {
      nextData[modalKey] = { activities: modalActivities, notes: modalNotes.trim() };
    }
    setWeekData(nextData);
    const storageKey = `week:${dateKey(getMondayOfWeek(weekOffset))}`;
    localStorage.setItem(storageKey, JSON.stringify(nextData));
    setIsModalOpen(false);
  };

  const handleClearDay = () => {
    const nextData = { ...weekData };
    delete nextData[modalKey];
    setWeekData(nextData);
    const storageKey = `week:${dateKey(getMondayOfWeek(weekOffset))}`;
    localStorage.setItem(storageKey, JSON.stringify(nextData));
    setIsModalOpen(false);
  };

  const buildWeekContext = () => {
    const dates = getWeekDates(weekOffset);
    const lines = [];
    let hasAny = false;
    dates.forEach((date, idx) => {
      const key = dateKey(date);
      const entry = weekData[key];
      const todayMark = isToday(date) ? ' (HOY)' : '';
      if (entry && (entry.activities?.length > 0 || entry.notes)) {
        hasAny = true;
        const acts = (entry.activities || []).map(tagLabel).join(', ');
        const notes = entry.notes ? ` — "${entry.notes}"` : '';
        lines.push(`• ${DAY_NAMES_FULL[idx]}${todayMark}: ${acts}${notes}`);
      } else {
        lines.push(`• ${DAY_NAMES_FULL[idx]}${todayMark}: sin registrar`);
      }
    });
    if (!hasAny) return null;
    const mon = dates[0], sun = dates[6];
    return `[CONTEXTO SEMANA ${mon.getDate()}/${mon.getMonth() + 1} – ${sun.getDate()}/${sun.getMonth() + 1}]\n${lines.join('\n')}\n`;
  };

  const sendMessage = async (textOverride = null) => {
    const raw = textOverride || userInput.trim();
    if (!raw || isLoading) return;

    const ctx = buildWeekContext();
    const finalMessage = ctx ? `${ctx}\n${raw}` : raw;

    const newMessages = [...messages, { role: 'user', content: raw }];
    setMessages(newMessages);
    setUserInput('');
    setIsLoading(true);

    const dayLabel = `${DAY_NAMES_FULL[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]}, ${new Date().getDate()} de ${MONTHS_FULL[new Date().getMonth()]}`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: finalMessage }],
          system_prompt: SYSTEM_PROMPT,
          day_label: dayLabel
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Error en API:", res.status, errorData);
        setMessages(prev => [...prev, { role: 'assistant', content: `_Error del servidor (${res.status}): ${errorData.error || errorData.message || 'Sin detalles'}_` }]);
        return;
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;

      if (content) {
        setMessages(prev => [...prev, { role: 'assistant', content: content }]);
      } else {
        console.warn("Respuesta sin contenido:", data);
        setMessages(prev => [...prev, { role: 'assistant', content: `_Error: No se recibió contenido. (Fuente: ${data.provider || 'desconocida'})_` }]);
      }
    } catch (err) {
      console.error("Error de red/fetch:", err);
      setMessages(prev => [...prev, { role: 'assistant', content: `_Error de conexión: ${err.message}. Revisa la consola o asegúrate de que 'netlify dev' está corriendo._` }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Rendering Markdown (simplified for port)
  const renderMarkdown = (text) => {
    return text
      .split('\n\n')
      .map((block, i) => {
        // Very basic markdown parsing
        let html = block
          .replace(/^### (.+)$/gm, '<h3>$1</h3>')
          .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
          .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
          .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

        if (html.includes('<li>')) html = `<ul>${html}</ul>`;
        if (!/^<[hublp\/]/.test(html.trim())) html = `<p>${html.replace(/\n/g, '<br>')}</p>`;
        
        return <div key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      });
  };

  const currentWeekDates = getWeekDates(weekOffset);
  const mon = currentWeekDates[0], sun = currentWeekDates[6];
  const weekRangeStr = `${mon.getDate()} ${MONTHS[mon.getMonth()]} – ${sun.getDate()} ${MONTHS[sun.getMonth()]}`;
  const weekLabelStr = weekOffset === 0 ? 'ACTUAL' : weekOffset === -1 ? 'PASADA' : weekOffset === 1 ? 'PRÓXIMA' : (weekOffset < 0 ? `HACE ${Math.abs(weekOffset)}w` : `EN ${weekOffset}w`);

  return (
    <div className="app-container">
      <header>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span className="logo-main">TRAIN<span style={{ color: 'var(--text-muted)' }}>OS</span></span>
          <span className="logo-sub">Planificador Personal</span>
        </div>
        <div className="status-label"><div className="status-dot"></div>IA activa</div>
      </header>

      <div className="main-layout">
        {/* LEFT PANEL */}
        <div className="left-panel">
          <div className="panel-header">
            <div className="panel-title">SEMANA <span>{weekLabelStr}</span></div>
            <div className="week-nav">
              <button className="week-btn" onClick={() => setWeekOffset(prev => prev - 1)}>←</button>
              <span className="week-nav-label">{weekRangeStr}</span>
              <button className="week-btn" onClick={() => setWeekOffset(prev => prev + 1)}>→</button>
            </div>
          </div>
          <div className="calendar-days">
            {currentWeekDates.map((date, idx) => {
              const key = dateKey(date);
              const entry = weekData[key] || { activities: [], notes: '' };
              const today = isToday(date);
              return (
                <div 
                  key={key} 
                  className={`day-row ${today ? 'today' : ''} ${entry.activities.length > 0 ? 'has-entry' : ''}`}
                  onClick={() => handleOpenModal(key, idx, date)}
                >
                  <div className="day-header">
                    <div className="day-name-wrap">
                      <span className="day-name">{DAY_NAMES[idx]}</span>
                      <span className="day-date">{date.getDate()} {MONTHS[date.getMonth()]}</span>
                      {today && <span className="day-today-badge">HOY</span>}
                    </div>
                    {entry.activities.length === 0 && <span className="add-label">+ añadir</span>}
                  </div>
                  {entry.activities.length > 0 && (
                    <div className="day-tags">
                      {entry.activities.map(a => <span key={a} className={`tag ${a}`}>{tagLabel(a)}</span>)}
                    </div>
                  )}
                  {entry.notes && <div className="day-preview">{entry.notes}</div>}
                </div>
              );
            })}
          </div>
          <div className="week-stats">
            <div className="stat-item"><div className="stat-val">{stats.active}</div><div className="stat-key">activos</div></div>
            <div className="stat-item"><div className="stat-val">{stats.empuje}</div><div className="stat-key">empuje</div></div>
            <div className="stat-item"><div className="stat-val">{stats.tiron}</div><div className="stat-key">tirón</div></div>
            <div className="stat-item"><div className="stat-val">{stats.run}</div><div className="stat-key">running</div></div>
            <div className="stat-item"><div className="stat-val">{stats.biceps}</div><div className="stat-key">bíceps días</div></div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="right-panel">
          <div className="pills-row">
            <button className="pill" onClick={() => sendMessage('¿Qué entreno hoy? Ten en cuenta lo que ya he hecho esta semana.')}>⚡ ¿Qué entreno hoy?</button>
            <button className="pill" onClick={() => sendMessage('Planifícame el resto de la semana según lo que ya llevo hecho.')}>📅 Planifica el resto</button>
            <button className="pill" onClick={() => sendMessage('Dame una sesión completa de empuje.')}>💪 Empuje</button>
            <button className="pill" onClick={() => sendMessage('Dame una sesión completa de tirón.')}>🏋️ Tirón</button>
            <button className="pill" onClick={() => sendMessage('Dame una sesión completa de pierna.')}>🦵 Pierna</button>
            <button className="pill" onClick={() => sendMessage('Analiza mi semana: volumen, frecuencia y bíceps.')}>📊 Análisis semana</button>
            <button className="pill" onClick={() => sendMessage('¿Debería descansar hoy según cómo va la semana?')}>🔋 ¿Descanso hoy?</button>
            <button className="pill" onClick={() => sendMessage('Dame un plan de running para esta semana.')}>🏃 Running</button>
          </div>

          <div className={`context-banner ${buildWeekContext() ? '' : 'hidden'}`}>
            <span>📅</span>
            <span>Contexto semanal activo · {Object.keys(weekData).length} registrado(s)</span>
          </div>

          <div className="chat-wrap" ref={chatWrapRef}>
            {messages.length === 0 && (
              <div className="welcome">
                <div style={{ fontSize: '44px' }}>🏋️</div>
                <h1>HOLA,<br /><span>ATLETA</span></h1>
                <p>Registra tus sesiones en el calendario de la izquierda. El asistente verá automáticamente lo que has hecho esta semana y te dará respuestas mucho más precisas.</p>
                <div className="welcome-hints">
                  <div className="hint-card" onClick={() => sendMessage('Planifícame la semana completa con los días de entreno y descanso.')}>
                    <strong>Empezar</strong>Plan para toda la semana
                  </div>
                  <div className="hint-card" onClick={() => sendMessage('¿Qué entreno hoy? Ten en cuenta lo que ya he hecho esta semana.')}>
                    <strong>Hoy</strong>¿Qué toca entrenar?
                  </div>
                  <div className="hint-card" onClick={() => sendMessage('Analiza mi semana: volumen, frecuencia, bíceps y fatiga acumulada.')}>
                    <strong>Análisis</strong>Revisar mi semana
                  </div>
                  <div className="hint-card" onClick={() => sendMessage('Tengo escalada mañana. ¿Cómo organizo el resto de la semana?')}>
                    <strong>Conflicto</strong>Escalada + ajustar semana
                  </div>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <div className="msg-avatar">{msg.role === 'user' ? '🧑' : '🤖'}</div>
                <div className="msg-content">
                  {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message assistant">
                <div className="msg-avatar">🤖</div>
                <div className="msg-content">
                  <div className="typing-indicator">
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="input-area">
            <div className="input-box">
              <textarea 
                id="userInput"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Cuéntame qué entrenaste, pídeme una sesión o analiza tu semana..." 
                rows="1"
              />
              <button id="sendBtn" disabled={isLoading} onClick={() => sendMessage()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            <div className="input-hint">Enter para enviar · Shift+Enter nueva línea</div>
          </div>
        </div>
      </div>

      {/* MODAL */}
      <div className={`modal-overlay ${isModalOpen ? '' : 'hidden'}`} onClick={(e) => e.target.className.includes('modal-overlay') && setIsModalOpen(false)}>
        <div className="modal">
          <div className="modal-title">{modalDate ? DAY_NAMES_FULL[modalIdx].toUpperCase() : ''}</div>
          <div className="modal-subtitle">
            {modalDate ? `${modalDate.getDate()} de ${MONTHS_FULL[modalDate.getMonth()]}` : ''}
            {modalDate && isToday(modalDate) ? ' · HOY' : ''}
          </div>
          <div className="modal-label">Actividades del día</div>
          <div className="activity-grid">
            {['empuje', 'tiron', 'pierna', 'running', 'escalada', 'core', 'descanso'].map(name => (
              <button 
                key={name}
                className={`activity-btn ${name} ${modalActivities.includes(name) ? 'active' : ''}`}
                onClick={() => handleToggleActivity(name)}
              >
                {name === 'empuje' && '💪 Empuje'}
                {name === 'tiron' && '🏋️ Tirón'}
                {name === 'pierna' && '🦵 Pierna'}
                {name === 'running' && '🏃 Running'}
                {name === 'escalada' && '🧗 Escalada'}
                {name === 'core' && '🔥 Core'}
                {name === 'descanso' && '😴 Descanso'}
              </button>
            ))}
          </div>
          <div className="modal-label">Notas de sesión (opcional)</div>
          <textarea 
            className="modal-textarea" 
            value={modalNotes}
            onChange={(e) => setModalNotes(e.target.value)}
            placeholder="Ej: Press banca 4x8 a 80kg, dominadas 4x6, curl inclinado 3x12. Sensaciones, carga, fatiga..." 
          />
          <div className="modal-actions">
            <button className="btn-clear" onClick={handleClearDay}>Borrar día</button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="btn-save" onClick={handleSaveDay}>Guardar</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
