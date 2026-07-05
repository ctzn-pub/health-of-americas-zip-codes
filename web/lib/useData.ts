"use client";
import { useEffect, useState } from "react";

/** Load a static payload on mount (loaders in lib/data.ts are cached, so remounting a
 *  section never refetches). Returns null while loading or on failure. */
export function usePayload<T>(loader: () => Promise<T>): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    loader().then((d) => alive && setData(d)).catch(() => {});
    return () => {
      alive = false;
    };
    // loaders are stable module-level functions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data;
}
