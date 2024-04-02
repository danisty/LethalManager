'use client'

import { CircularProgress } from '@nextui-org/react';
import { ScanResult } from './installs/page';
import { invoke } from '@tauri-apps/api/tauri';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Main() {
	const router = useRouter();

	useEffect(() => {
		invoke('load_package').then(() => {
			invoke<ScanResult>('scan').then(result => {
				if (result.selected_install_path) {
					router.replace('/profiles');
				} else {
					router.replace('/installs')
				}
			});
		});
	}, []);

	return (
		<main className="flex flex-col justify-center items-center min-h-screen">
			<CircularProgress />
		</main>
	);
}
