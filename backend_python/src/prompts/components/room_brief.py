"""
Prompt of the room brief ("scheda stanza") updater (Phase 138 PR-5).

After a chat turn that brought new facts about a room, the summarizer model
(`ModelRole.SUMMARIZER`, src/services/room_brief.py) rewrites the room's brief
from its current content and the room's new messages. The brief feeds the room
index of the session block, `get_room_context`, the per-room quote and the
restore of a session after a restart.

`ROOM_BRIEF_PROMPT` is filled with `str.format`: its placeholders are
`room_label`, `room_type`, `scope`, `current_brief` and `messages`.
"""

ROOM_SCOPE = (
    "Questa scheda riguarda SOLO la stanza {room_label}: ignora i fatti delle altre stanze."
)

# "Generale" collects what concerns the whole home and the rooms the client
# talked about but never created (they would otherwise reach no quote section).
GENERAL_SCOPE = (
    "Questa è la scheda GENERALE del progetto: raccoglie i lavori su tutta la casa (impianti, caldaia, "
    "infissi, protezioni, smaltimento) e gli ambienti citati dal cliente ma non ancora creati come stanza. "
    "Per un ambiente non creato scrivi una decisione nella forma \"<Ambiente> (stanza non creata): "
    "<lavori e misure>\". Ignora i fatti che riguardano solo una stanza già creata."
)

ROOM_BRIEF_PROMPT = """Sei il sistema di memoria di SYD, consulente per ristrutturazioni.
Aggiorna la scheda della stanza "{room_label}" (tipo: {room_type}) con i fatti nuovi dei messaggi qui sotto.

{scope}

REGOLE
1. Usa solo fatti detti dal cliente o analisi di SYD che il cliente non ha smentito. Le misure date dal
   cliente prevalgono sulle stime fatte dalle foto.
2. Parti dalla scheda attuale: tieni ogni fatto ancora valido, correggi quelli smentiti, aggiungi i nuovi.
3. Misure in numeri: floor_mq e walls_mq in metri quadrati, height_m in metri.
4. surfaces, systems, fixtures: frasi brevi in italiano (stato attuale e cosa cambia), al massimo 1000 caratteri.
5. criticalities, decisions, open_questions: voci brevi in italiano (al massimo 300 caratteri l'una, 20 voci);
   togli una domanda aperta quando il cliente ha risposto.
6. Niente prezzi o importi: la scheda descrive la stanza, non il preventivo.
7. summary: una riga in italiano (al massimo 200 caratteri) che sintetizza la stanza per l'indice delle stanze.
8. changed: false se i messaggi non aggiungono né correggono nulla; in quel caso riscrivi la scheda attuale.

SCHEDA ATTUALE (JSON)
{current_brief}

MESSAGGI NUOVI
{messages}
"""
