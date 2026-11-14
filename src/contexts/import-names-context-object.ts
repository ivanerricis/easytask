import { createContext, useContext } from "react"
import type { ChooseImportNames } from "@/lib/workspace-transfer"

export const ImportNamesContext = createContext<ChooseImportNames | undefined>(undefined)

/** The function that asks the names of an import (undefined outside the provider: the proposed names are used). */
export const useImportNames = () => useContext(ImportNamesContext)
