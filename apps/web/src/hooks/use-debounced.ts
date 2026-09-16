"use client";

import { useEffect, useState } from "react";

/**
 * Holds a value still for `delay`, so a search runs on a pause, not a keystroke.
 *
 * Every filter that talks to the server through what someone is typing wants
 * this, and each one that reimplements it picks its own delay. A shared hook
 * is how the pause stays the same across the product.
 */
export function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
