'use client'

import { useCallback, useState } from "react";

const cache: Record<string, any> = {};

export function usePersistedState<T>(key: string, defaultValue?: T): [T, (newState: T) => void] {
    const [state, setState] = useState<T>(() => {
        const storedValue = cache[key];
        return storedValue !== undefined ? storedValue : defaultValue;
    });

    const setter = useCallback((newState: T) => {
        cache[key] = newState;
        setState(newState);
    }, [key]);

    return [state, setter];
};