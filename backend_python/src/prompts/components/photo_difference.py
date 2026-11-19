"""What another photo of a room adds to the photo already measured (services/room_photo_vision.py)."""

# Answer when the other photo adds nothing: no note is kept.
NOTHING_NEW = "NESSUNA"

PHOTO_DIFFERENCE_PROMPT = f"""\
Sei un geometra esperto di ristrutturazioni. Ricevi DUE foto della stessa stanza.
1. La PRIMA è la foto di riferimento, già misurata.
2. La SECONDA è un'altra foto della stanza.

Scrivi in italiano, in una o due frasi, SOLO quello che la seconda foto mostra e la prima no e che conta
per i lavori: pareti o angoli non visibili prima, porte e finestre, impianti (prese, radiatori, scarichi,
caldaia), danni (umidità, crepe, distacchi), materiali e stato delle superfici.
Non ripetere quello che si vede già nella prima foto, non stimare misure, non parlare di arredi.
Se la seconda foto non aggiunge niente che conti per i lavori, rispondi solo: {NOTHING_NEW}
"""
