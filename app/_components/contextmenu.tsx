'use client'

import React, { useRef, useState, useCallback, useEffect, ReactElement, ReactNode } from "react";

export default function ContextMenu({ children, onBuild }: { children: ReactNode, onBuild: (close: () => void) => ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);

	const [isOpen, setOpen] = useState(false);
	const [pos, setPos] = useState([0, 0]);

    const contextMenuHandler = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setPos([e.clientX, e.clientY])
		setOpen(true);
	}, []);

	const keyDownListener = useCallback((e: KeyboardEvent) => {
		if (e.code == 'Escape') {
			setOpen(false);
		}
	}, []);

	const clickListener = useCallback((e: MouseEvent) => {
		const rect = ref.current?.getBoundingClientRect();
		const outArea = rect && (e.clientX < rect.x || e.clientX > rect.x + rect.width
							 || e.clientY < rect.y || e.clientY > rect.y + rect.height);
		if (outArea) {
			setOpen(false);
		}
	}, []);

	useEffect(() => {
		window.addEventListener('keydown', keyDownListener);
		window.addEventListener('mousedown', clickListener);
		return () => {
			window.removeEventListener('keydown', keyDownListener);
			window.removeEventListener('mousedown', clickListener);
		}
	}, []);

    return (
        <>
            <div onContextMenu={contextMenuHandler}>
                {children}
            </div>
            {isOpen && <>
                <div className="top-0 left-0 z-10 absolute w-screen h-screen"></div>
                <div ref={ref} className="z-10 absolute border-1 border-neutral-600 bg-background-rgb p-1 rounded-small w-40" style={{ left: pos[0], top: pos[1] }}>
                    {onBuild(() => setOpen(false))}
                </div>
            </>}
        </>
    );
}