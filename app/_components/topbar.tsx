'use client'

import { Button } from '@nextui-org/react';
import { WebviewWindow } from '@tauri-apps/api/window';
import React, { useEffect, useState } from 'react';
import { Install } from '../installs/page';
import { invoke } from '@tauri-apps/api/tauri';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image'
import { usePersistedState } from '@/app/_utils/state';

export default function TopBar() {
	const router = useRouter();
    const pathname = usePathname();
	
	const [appWindow, setAppWindow] = useState<WebviewWindow>();
	const [lastClick, setLastClick] = useState(0);
	const [selectedInstall, setSelectedInstall] = usePersistedState<Install>('selected_install');

	async function setupAppWindow() {
		const appWindow = (await import('@tauri-apps/api/window')).appWindow;
		setAppWindow(appWindow);
	}

	useEffect(() => {
		setupAppWindow();
		invoke<Install>('get_selected_install').then((install: Install) => 
			setSelectedInstall(install)
		);
	}, []);

	return (
		<div
			className="flex flex-row items-center w-full h-12">
			<i className="p-4 w-16 text-center ri-box-1-fill"></i>
			<div
				className="flex flex-grow items-center bg-inherit h-full select-none"
				onMouseMove={(e) => {
					if (Math.abs(e.movementX) > 1) setLastClick(0);
				}}
				onMouseDown={() => {
					appWindow?.startDragging();
					if (Date.now() - lastClick <= 300) {
						appWindow?.toggleMaximize()
					}
					setLastClick(Date.now());
				}}>
				<a>Lethal Manager</a>
			</div>
			{selectedInstall && pathname !== '/installs' &&
				<Button disableRipple variant="ghost" className="flex flex-row bg-background-rgb mr-1 p-1 text-xs"
					onPress={() => router.push('/installs')}>
					<Image
						alt="Instance image"
						className="rounded-lg"
						width={30}
						height={30}
						src={selectedInstall.icon} />
					<div className="flex flex-col items-start max-w-48">
						<a className="w-full text-neutral-100 overflow-ellipsis overflow-hidden">{selectedInstall.path}</a>
						<a className="text-blue-400">Change install</a>
					</div>
				</Button>
			}
			<Button isIconOnly disableRipple variant="light" radius="none" className="w-9 min-w-0 h-full"
				onPress={() => appWindow?.minimize()}>
				<i className="font-medium ri-subtract-line"></i>
			</Button>
			<Button isIconOnly disableRipple variant="light" radius="none" className="w-9 min-w-0 h-full"
				onPress={() => appWindow?.toggleMaximize()}>
				<i className="font-medium ri-fullscreen-line"></i>
			</Button>
			<Button isIconOnly disableRipple variant="solid" radius="none" className="bg-inherit hover:bg-red-500 w-9 min-w-0 h-full hover:text-black"
				onPress={() => appWindow?.close()}>
				<i className="font-medium text-base ri-close-line"></i>
			</Button>
		</div>
	);
};
