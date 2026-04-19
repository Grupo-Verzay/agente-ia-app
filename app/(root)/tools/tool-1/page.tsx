import IframeRenderer from "@/components/custom/IframeRenderer";
import { currentUser } from "@/lib/auth";
import { getTools } from "@/actions/tools-action";
import { redirect } from "next/navigation";

const ToolOne = async () => {
    const user = await currentUser();

    if (!user) {
        redirect("/login");
    }

    const toolResponse = await getTools(user.id);
    const toolsMap: Record<string, string> = {};

    if (toolResponse.success && toolResponse.data) {
        for (const tool of toolResponse.data) {
            toolsMap[tool.name] = tool.description || "";
        }
    }

    console.table(toolsMap);

    const sheetUrl = toolsMap.tool1;

    if (!sheetUrl) {
        redirect("/tools"); // O muestra mensaje de error personalizado si prefieres
    }

    return <IframeRenderer url={sheetUrl} />;
};

export default ToolOne;
