import { AdGeneratorStudio } from "./AdGeneratorStudio";

interface MainAiImageProps {
  hasGoogleKey: boolean;
  dbStyles: { id: string; name: string; description: string }[];
}

export function MainAiImage({ hasGoogleKey, dbStyles }: MainAiImageProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto lg:overflow-hidden">
      <AdGeneratorStudio hasGoogleKey={hasGoogleKey} dbStyles={dbStyles} />
    </div>
  );
}

