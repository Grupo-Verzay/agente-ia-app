'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { BookingQuestionItem } from '@/actions/booking-questions-actions';
import type { FormAnswer } from '@/actions/booking-form-actions';

interface Props {
  questions: BookingQuestionItem[];
  answers: FormAnswer[];
  onAnswersChange: (answers: FormAnswer[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export function QualificationStep({ questions, answers, onAnswersChange, onBack, onNext }: Props) {
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  function getAnswer(questionId: string): string {
    return answers.find((a) => a.questionId === questionId)?.answer ?? '';
  }

  function setAnswer(q: BookingQuestionItem, value: string) {
    const updated = answers.filter((a) => a.questionId !== q.id);
    if (value) updated.push({ questionId: q.id, label: q.label, answer: value });
    onAnswersChange(updated);
    if (errors[q.id]) setErrors((prev) => ({ ...prev, [q.id]: false }));
  }

  function handleNext() {
    const newErrors: Record<string, boolean> = {};
    for (const q of questions) {
      if (q.required && !getAnswer(q.id).trim()) newErrors[q.id] = true;
    }
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }
    onNext();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <ClipboardList className="h-4 w-4 shrink-0" />
        <p className="text-sm">Cuéntanos un poco sobre tu negocio para aprovechar mejor la reunión.</p>
      </div>

      <div className="flex flex-col gap-4">
        {questions.map((q) => (
          <div key={q.id} className="space-y-1.5">
            <Label className="text-sm font-medium">
              {q.label}
              {q.required && <span className="ml-1 text-destructive">*</span>}
            </Label>

            {q.type === 'TEXT' && (
              <Input
                value={getAnswer(q.id)}
                onChange={(e) => setAnswer(q, e.target.value)}
                className={errors[q.id] ? 'border-destructive' : ''}
              />
            )}

            {q.type === 'TEXTAREA' && (
              <Textarea
                value={getAnswer(q.id)}
                onChange={(e) => setAnswer(q, e.target.value)}
                rows={3}
                className={`resize-none ${errors[q.id] ? 'border-destructive' : ''}`}
              />
            )}

            {q.type === 'SELECT' && (
              <Select value={getAnswer(q.id)} onValueChange={(v) => setAnswer(q, v)}>
                <SelectTrigger className={errors[q.id] ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {q.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {errors[q.id] && (
              <p className="text-xs text-destructive">Este campo es obligatorio</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> Atrás
        </Button>
        <Button size="sm" onClick={handleNext}>
          Continuar <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
