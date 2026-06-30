// /ia entra directo al primer canal de entrenamiento (tabs arriba).
import { redirect } from 'next/navigation';
import { DEFAULT_TRAINING_CHANNEL } from '@/lib/channel-training';

export default function IaIndexPage() {
    redirect(`/ia/${DEFAULT_TRAINING_CHANNEL}`);
}
