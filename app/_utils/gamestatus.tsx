import { invoke } from "@tauri-apps/api/tauri";
import { useEffect, useState } from "react";
import { usePersistedState } from "./state";

export type GameStatus = {
    running: boolean,
    profile?: string
};

export type GameStatusResult = {
    status: GameStatus,
    checkStatus: () => void
};

export default function useGameStatus(): GameStatusResult {
    const [gameStatus, setGameStatus] = usePersistedState<GameStatus>('game_status', { running: false });

    const checkGameStatus = async () => {
        const response = await invoke<GameStatus>('get_game_status');
        setGameStatus(response);
    };

    useEffect(() => {
        checkGameStatus();
        const interval = setInterval(checkGameStatus, 5000);
        return () => {
            clearInterval(interval);
        };
    }, []);

    return { status: gameStatus, checkStatus: checkGameStatus };
};