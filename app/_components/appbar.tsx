'use client'

import 'remixicon/fonts/remixicon.css'
import { Button, Tooltip } from "@nextui-org/react";
import TopBar from "./topbar";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from 'react';

const Tab = ({ name, icon, selected, setContent }: { name: string, icon: string, selected: boolean, setContent: () => void }) => {
	return (
		<Tooltip content={name} placement="right" delay={400} closeDelay={10}>
			<Button isIconOnly disableRipple size="lg" variant={selected ? "solid" : "light"}
				onPress={setContent}>
				<i className={`${icon} text-xl`}></i>
			</Button>
		</Tooltip>
	);
}

export default function AppBar({ children, noSideBar }: { children: ReactNode, noSideBar?: boolean }) {
	const router = useRouter();
    const pathname = usePathname();
    
    return (
        <main className="flex flex-col max-w-full min-h-screen">
            <TopBar />
            <div className="flex flex-row flex-grow w-full h-20">
                {!noSideBar && <div className="flex flex-col gap-2 px-2 pb-2">
                    <Tab name="Profiles"
                        icon="ri-home-2-line"
                        selected={pathname && pathname.includes('/profiles') || false}
                        setContent={() => {
                            router.push('/profiles');
                        }} />
                    <Tab name="Search mods"
                        icon="ri-search-line"
                        selected={pathname == '/search'}
                        setContent={() => {
                            router.push('/search');
                        }} />
                    <div className="flex-grow"></div>
                    <Tab name="Settings"
                        icon="ri-settings-line"
                        selected={pathname == '/settings'}
                        setContent={() => {
                            router.push('/settings');
                        }} />
                </div>}
                <div className="flex-grow bg-black pr-1 rounded-tl-lg max-h-full overflow-hidden">
                    {children}
                </div>
            </div>
        </main>
    );
  }