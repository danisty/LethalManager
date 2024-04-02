'use client'

import { Image, Button, Spinner } from '@nextui-org/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/tauri';
import AppBar from '@/app/_components/appbar';

export type ScanResult = {
	selected_install_path?: string,
	installs: Install[]
}

export type Install = {
	path: string,
	icon: string,
	source: string
};

export default function InstallSelector() {
	const router = useRouter();

	const [scanResult, setScanResult] = useState<ScanResult>();
	const [isScanning, setIsScanning] = useState(true);

	const scanInstalls = useCallback(() => {
		setIsScanning(true);
		invoke<ScanResult>('scan')
			.then(result => {
				setScanResult(result);
				setIsScanning(false);
			});
	}, []);

	const addManualInstall = useCallback(() => {
		setIsScanning(true);
		invoke<ScanResult>('add_manual_install')
			.then(() => {
				scanInstalls();
			});
	}, []);

	useEffect(() => {
		invoke<ScanResult>('scan')
			.then(result => {
				setIsScanning(false);
				setScanResult(result);
			});
	}, []);

	return (
		<AppBar noSideBar>
			<div className="flex flex-col flex-grow justify-center items-center bg-background-rgb h-full">
				<div className="flex flex-row items-center gap-3 h-[205px]">
					{isScanning && <Spinner/>}
					{!isScanning && scanResult!.installs.length === 0 && <a>No instances found. Try adding one!</a>}
					{!isScanning && scanResult!.installs.map((install, i) => (
						<Button key={i} disableRipple variant="ghost" className={
								"flex-col p-3 w-40 h-max " +
								(scanResult!.selected_install_path === install.path
									? (install.source === "Steam" ? "border-blue-400" : "border-green-400")
									: ""
								)
							}
							onPress={() => {
								invoke('select_install', { path: install.path });
								if (window.history.length > 1) {
									router.back();
								} else {
									router.push('/profiles');
								}
							}}>
							<Image
								className="rounded-lg size-32"
								alt="Instance image"
								src={install.icon} />
							<div className="flex flex-col items-start w-full">
								<a className="w-full text-ellipsis overflow-hidden">{install.path}</a>
								<a className={install.source === "Steam" ? "text-blue-400" : "text-green-400"}>
									<i className={install.source === "Steam" ? "ri-steam-fill pr-1" : "ri-folder-fill pr-1"}></i>
									{install.source}
								</a>
							</div>
						</Button>
					))}
				</div>
				<div className="flex flex-row gap-3 pt-4">
					<Button disableRipple variant="ghost" startContent={<i className="ri-search-line"></i>}
						onPress={scanInstalls}>
						Scan for installs
					</Button>
					<Button disableRipple variant="ghost" startContent={<i className="ri-folder-open-line"></i>}
						onPress={addManualInstall}>
						Manually add install
					</Button>
				</div>
			</div>
		</AppBar>
	);
};
