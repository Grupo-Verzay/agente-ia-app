#!/usr/bin/env python3
"""Saca de chats-client (de un commit) el panel de «sin conversación» tal cual
estaba, y lo envuelve en un componente para pintarlo al lado del de hoy.
Se cae con estruendo si el ancla no aparece exactamente una vez."""
import sys
src = sys.stdin.read()
ancla = '<div className="hidden sm:flex h-full flex-1 flex-col items-center justify-center gap-5 select-none border-l'
if src.count(ancla) != 1:
    sys.exit(f"el ancla aparece {src.count(ancla)} veces")
a = src.index(ancla)
# Cuenta los <div> para encontrar su cierre.
i, prof = a, 0
while True:
    abre = src.find("<div", i)
    cierra = src.find("</div>", i)
    if abre != -1 and abre < cierra:
        prof += 1
        i = abre + 4
    else:
        prof -= 1
        i = cierra + 6
        if prof == 0:
            break
bloque = src[a:i]
print('"use client";\nexport function PanelDeChatsDeAntes({ goToChatTab }: { goToChatTab: (t: string, u?: boolean) => void }) {\n  return (\n' + bloque + '\n  );\n}')
