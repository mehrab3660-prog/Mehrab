"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface AiAdvisorState {
  open: boolean;
  setOpen: (open: boolean) => void;
  prefill: string;
  openWithMessage: (message: string) => void;
  consumePrefill: () => void;
}

const AiAdvisorContext = createContext<AiAdvisorState | undefined>(undefined);

export function AiAdvisorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState("");

  const openWithMessage = (message: string) => {
    setPrefill(message);
    setOpen(true);
  };

  const consumePrefill = () => setPrefill("");

  return (
    <AiAdvisorContext.Provider value={{ open, setOpen, prefill, openWithMessage, consumePrefill }}>
      {children}
    </AiAdvisorContext.Provider>
  );
}

export function useAiAdvisor() {
  const ctx = useContext(AiAdvisorContext);
  if (!ctx) throw new Error("useAiAdvisor must be used within AiAdvisorProvider");
  return ctx;
}
