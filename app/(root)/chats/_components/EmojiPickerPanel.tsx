'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';

const CATEGORIES: { label: string; emojis: string[] }[] = [
    {
        label: '😀 Caras',
        emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😶‍🌫️','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','😵‍💫','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👾','🤖'],
    },
    {
        label: '👋 Manos',
        emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👁️','👀','👅','👄'],
    },
    {
        label: '❤️ Corazones',
        emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☯️','💯','♾️','🔥','✨','⭐','🌟','💫','⚡','🌈','🎉','🎊','🎈','🎁','🏆','🥇'],
    },
    {
        label: '🐶 Animales',
        emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🐢','🐍','🦎','🦖','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈'],
    },
    {
        label: '🍎 Comida',
        emojis: ['🍎','🍊','🍋','🍇','🍓','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍆','🥦','🥕','🌽','🌶️','🥒','🍞','🥐','🥖','🥨','🧀','🥚','🍳','🥞','🧇','🥓','🍗','🍖','🌭','🍔','🍟','🍕','🌮','🌯','🥗','🍜','🍝','🍛','🍱','🍣','🍤','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🍫','🍭','🍮','☕','🍵','🧃','🥤','🧋','🍺','🥂','🍷'],
    },
    {
        label: '⚽ Deportes',
        emojis: ['⚽','🏀','🏈','⚾','🥎','🏐','🏉','🎾','🥏','🎳','🏏','🏑','🏒','🥍','🏓','🏸','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥅','⛳','🎣','🤿','🎽','🎿','🛷','🥌','🎯','🎱','🏹','🎣','🤸','⛹️','🏋️','🤼','🤺','🏇','⛷️','🏂','🪂','🏄','🚣','🧘'],
    },
    {
        label: '🚗 Viaje',
        emojis: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🛺','🚁','🛸','✈️','🚀','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏭','🗼','⛩️','🕌','🕍','⛪','🗽','🗿','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🌅','🌄','🌠','🎆','🎇','🌌','🌃','🌉'],
    },
];

interface EmojiPickerPanelProps {
    onSelect: (emoji: string) => void;
}

export function EmojiPickerPanel({ onSelect }: EmojiPickerPanelProps) {
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState(0);

    const filtered = useMemo(() => {
        if (!search.trim()) return null;
        const all = CATEGORIES.flatMap((c) => c.emojis);
        return all.filter((e) => e.includes(search));
    }, [search]);

    const display = filtered ?? CATEGORIES[activeCategory].emojis;

    return (
        <div className="flex flex-col w-[300px] h-[350px] bg-background border border-border rounded-xl shadow-xl overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-border shrink-0">
                <Input
                    autoFocus
                    placeholder="Buscar emojis…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 text-sm"
                />
            </div>

            {/* Category tabs */}
            {!search && (
                <div className="flex overflow-x-auto border-b border-border shrink-0 px-1">
                    {CATEGORIES.map((cat, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setActiveCategory(i)}
                            className={`px-2 py-1.5 text-base shrink-0 transition-colors rounded-md ${i === activeCategory ? 'bg-accent' : 'hover:bg-accent/50'}`}
                            title={cat.label}
                        >
                            {cat.emojis[0]}
                        </button>
                    ))}
                </div>
            )}

            {/* Emoji grid */}
            <div className="flex-1 overflow-y-auto p-1">
                <div className="grid grid-cols-8 gap-0.5">
                    {display.map((emoji, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => onSelect(emoji)}
                            className="text-xl p-1 rounded hover:bg-accent transition-colors leading-none"
                            title={emoji}
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
