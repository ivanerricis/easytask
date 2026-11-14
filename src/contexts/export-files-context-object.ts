import { createContext } from "react"
import type { AskIncludeFiles } from "@/lib/workspace-transfer"

export const ExportFilesContext = createContext<AskIncludeFiles | undefined>(undefined)
