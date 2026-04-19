import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";


export const HeaderWithInfo = ({ title, info }: { title: string; info: string }) => (
    <div className="flex items-center gap-2">
        <span>{title}</span>
        <Tooltip>
            <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground">
                    <Info className="h-5 w-5 text-primary" />
                </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px] text-xs leading-relaxed">
                {info}
            </TooltipContent>
        </Tooltip>
    </div>
);