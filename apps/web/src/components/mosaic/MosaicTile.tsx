"use client";

import { type ReactNode } from "react";

export function MosaicSurface({ children }: { children: ReactNode }) {
  return <div className="mosaic-wall">{children}</div>;
}