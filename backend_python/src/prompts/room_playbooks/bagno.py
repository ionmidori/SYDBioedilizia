"""Bathroom playbook. The checklist was `<for type="bagno">` in MODE_B_SURVEYOR."""
from src.prompts.room_playbooks.schema import RoomPlaybook

BAGNO = RoomPlaybook(
    room_key="bagno",
    aliases=("bagno", "wc", "servizi", "bathroom"),
    prompt_guidance=(
        "- Rifacimento completo o solo parziale? (sanitari / rivestimenti / tutto)\n"
        "- Le pareti sono rivestite a piastrelle? Fino a che altezza?\n"
        "- Tipo di doccia/vasca desiderata? (box doccia, walk-in, vasca incasso, sostituzione piatto)\n"
        "- Riscaldamento a pavimento o radiatore a scaldasalviette?\n"
        "- Tipo sanitari: monoblocco, sospeso, WC + bidet separati?\n"
        "- Impianto idraulico attuale: da rifare o sufficiente?\n"
        "- Sanitari o scarichi da spostare rispetto a dove sono ora?"
    ),
    vision_hints=(
        "- altezza del rivestimento: fin dove arrivano le piastrelle\n"
        "- sanitari: sospesi o a terra, monoblocco o WC + bidet separati\n"
        "- doccia: piatto, box o vasca\n"
        "- scaldasalviette o radiatore"
    ),
)
