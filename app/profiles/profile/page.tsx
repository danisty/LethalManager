'use client'

import AppBar from "@/app/_components/appbar";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePersistedState } from "@/app/_utils/state";
import { Button, Image, Pagination, SortDescriptor, Switch, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@nextui-org/react";
import { ModInfo } from "@/app/search/page";
import { invoke, convertFileSrc } from "@tauri-apps/api/tauri";
import React from "react";
import useGameStatus from "@/app/_utils/gamestatus";

export type Profile = {
    name: string,
    icon: string,
    folder: string
};

function _Profile() {
    const params = useSearchParams();
    const router = useRouter();

    const [query, setQuery] = useState('');
    const [profile, setProfile] = usePersistedState<Profile>(params.get('name')!);
    const [profileMods, setProfileMods] = usePersistedState<ModInfo[]>(params.get('name')! + '_mods', []);
    const [page, setPage] = usePersistedState(params.get('name')! + '_search_page', 1);
    const [sortDescriptor, setSortDescriptor] = React.useState<SortDescriptor>({
        column: 'name',
        direction: 'ascending',
    });

    const game = useGameStatus();
	const isProfileRunning = game.status.running && game.status.profile! === profile?.name;
    
    const ref = useRef<HTMLDivElement>(null);

    const search = (query: string) => {
        setPage(1);
        setQuery(query);
    }

    const filteredMods = React.useMemo(() => {
        return profileMods.filter(m => m.name.match(new RegExp(query, 'i')))
    }, [query, profileMods]);
    const mods = React.useMemo(() => {
        const start = (page - 1) * 20;
        const end = start + 20;

        return filteredMods
            .sort((a, b) => {
                return a.name.localeCompare(b.name) * (sortDescriptor.direction === 'descending' ? -1 : 1);
            })
            .slice(start, end);
    }, [page, filteredMods, sortDescriptor]);
    const pages = Math.ceil(filteredMods.length / 20);

    const pagination = React.useMemo(() => (
        <div className="flex justify-center w-full">
            <Pagination
                showControls
                page={page}
                total={pages}
                onChange={(page) => setPage(page)}
                className="p-[0.40rem]"
                classNames={{ item: "bg-background-rgb", next: "bg-background-rgb", prev: "bg-background-rgb" }} />
        </div>
    ), [page, pages]);

    const renderCell = React.useCallback((mod: ModInfo, columnKey: React.Key) => {
        switch (columnKey) {
            case "name":
                return (
                    <div className="flex flex-row justify-start items-center gap-2 w-full h-fit">
                        <picture className="shrink-0">
                            <img alt="" className="rounded-lg size-12" src={convertFileSrc(mod.icon!)} />
                        </picture>
                        <div className="flex flex-col flex-grow items-start pl-1">
                            <a className="line-clamp-1 font-bold text-lg break-all overflow-ellipsis">{
                                mod.name
                            }</a>
                            <a className="line-clamp-1 text-neutral-300 text-start text-wrap overflow-ellipsis">{
                                mod.description
                            }</a>
                        </div>
                    </div>
                );
                case "version":
                return (
                    <a>{mod.version_number}</a>
                );
            case "author":
                return (
                    <a>{mod.author}</a>
                );
            case "actions":
                return (
                    <div className="flex flex-row justify-end gap-2">
                        <Button disableRipple isIconOnly size="sm" variant="ghost"
                            onPress={() => 
                                invoke('show_in_explorer', { path: mod.folder })
                            }>
                            <i className="text-lg ri-folder-fill"></i>
                        </Button>
                        <Switch
                            color="success"
                            isSelected={mod.enabled}
                            classNames={{ "wrapper": "m-0" }}
                            onChange={() => {
                                invoke('toggle_mod', { profile: profile.name, name: mod.full_name }).then(getProfileMods)
                            }}/>
                        <Button disableRipple isIconOnly size="sm" variant="ghost"
                            onPress={() => 
                                invoke('delete_mod', { profile: profile.name, name: mod.full_name }).then(getProfileMods)
                            }>
                            <i className="text-lg ri-close-line"></i>
                        </Button>
                    </div>
                );
        }
    }, [profile, mods]);

    const table = React.useMemo(() => (
        <Table
            isCompact
            removeWrapper
            selectionMode="multiple"
            onSortChange={setSortDescriptor}
            sortDescriptor={sortDescriptor}
            topContent={filteredMods.length > 20 ? pagination : undefined}
            bottomContent={filteredMods.length > 20 ? <div className="pb-2">{pagination}</div> : undefined}
            classNames={{
                thead: "rounded-none",
                table: "bg-background-rgb rounded-lg min-w-0",
                th: [
                    "bg-transparent text-default-500 border-b border-divider",
                    "first:pr-0",
                ],
                td: [
                    "py-2",
                    "first:pr-0 second:pl-0",
                    "group-data-[odd=true]:bg-[#0A0A0A]",
                    "group-data-[first=true]:first:before:rounded-none",
                    "group-data-[first=true]:last:before:rounded-none",
                    "group-data-[middle=true]:before:rounded-none",
                    "group-data-[last=true]:first:before:rounded-none",
                    "group-data-[last=true]:last:before:rounded-none",
                ]
            }}>
            <TableHeader>
                <TableColumn key="name" align="start" allowsSorting>
                Name
                </TableColumn>
                <TableColumn key="author" align="start" allowsSorting>
                Author
                </TableColumn>
                <TableColumn key="version" align="start">
                Version
                </TableColumn>
                <TableColumn key="actions" align="start">
                <></>
                </TableColumn>
            </TableHeader>
            <TableBody items={mods}>
                {(mod) => (
                <TableRow key={mod.full_name} data-hover={false}>
                    {(columnKey) => <TableCell>{renderCell(mod, columnKey)}</TableCell>}
                </TableRow>
            )}
            </TableBody>
        </Table>
    ), [mods, profileMods, renderCell, page, pages]);

    const getProfileMods = useCallback(() => {
        invoke<ModInfo[]>('get_profile_mods', { profile: params.get('name') })
            .then((mods) => {
                setProfileMods(mods);
            });
    }, []);

    useEffect(() => {
        ref.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, [page]);

    useEffect(() => {
        if (!profile) {
            invoke<Profile>('get_profile', { name: params.get('name') })
                .then(p => {
                    setProfile(p);
                });
        }
        getProfileMods();
    }, []);
    
    return (
        <AppBar>
            <div className="relative flex flex-row h-full">
                <div className="py-4 pl-4 w-[200px] h-full overflow-auto scrollbar-hide">
                    {profile && <div className="flex flex-col bg-background-rgb p-4 rounded-lg">
                        {profile.icon
                            ? <picture className="bg-primary-rgb rounded-lg w-full overflow-hidden aspect-square shrink-0">
                                <div className="bg-cover size-full" style={{ backgroundImage: `url(${convertFileSrc(profile.icon)})` }}></div>
                            </picture>
                            : <div className="bg-primary-rgb rounded-lg w-full aspect-square"></div>}
                        <a className="pt-2 font-bold text-lg break-all">{profile.name}</a>
                        <a className="pb-3 text-neutral-400">{profileMods.length} mods</a>
                        <div className="flex flex-col gap-2">
                            <Button disableRipple radius="sm" color={isProfileRunning ? "danger" : "success"} className="font-medium"
                                onPress={() => {
                                    if (game.status.running)
                                        invoke('stop_game').then(game.checkStatus);
                                    if (!isProfileRunning)
                                        invoke('play_profile', { name: profile.name }).then(game.checkStatus);
                                }}>
                                <i className={"m-auto text-lg " + (isProfileRunning ? "ri-stop-fill" : "ri-play-fill")}></i>
                                <a className="flex-grow">{isProfileRunning ? "Stop" : "Play"}</a>
                            </Button>
                            <Button disableRipple radius="sm" className="font-medium"
                                onPress={() =>
                                    invoke('show_in_explorer', { path: profile.folder })
                                }>
                                <i className="text-medium ri-folder-fill"></i>
                                <a className="flex-grow">Folder</a>
                            </Button>
                            <Button disableRipple radius="sm" className="font-medium">
                                <i className="text-medium ri-export-fill"></i>
                                <a className="flex-grow">Export</a>
                            </Button>
                        </div>
                    </div>}
                </div>
                <div ref={ref}  className="flex-1 p-4 w-0 overflow-auto">
                    <div className="flex flex-col">
                        <div className="flex flex-row gap-3 bg-background-rgb p-3 pb-3 rounded-xl">
                            <div className="relative flex-grow">
                                <input className="flex-grow bg-primary-rgb p-2 rounded-lg w-full h-9"
                                    placeholder="Search mod..." value={query}
                                    onChange={(e) => search(e.target.value) } />
                                <button className="right-2 absolute h-full" onClick={() => search('')}>
                                    <i className="text-lg ri-close-line"></i>
                                </button>
                            </div>
                            <Button disableRipple radius="sm" className="bg-green-500 w-32 h-auto min-h-0 font-medium text-black"
                                onPress={() => router.push(`/search?profile=${JSON.stringify({
                                    name: profile.name,
                                    icon: profile.icon
                                })}`)}>
                                <i className="text-medium ri-add-circle-fill"></i>
                                Add mods
                            </Button>
                        </div>
                        <div className="flex flex-col pt-4 rounded-lg overflow-hidden">{
                            profile && mods.length !== 0
                            ? table
                            : <a className="p-4 w-full text-center">
                                Maybe you should add some mods...
                            </a>
                        }</div>
                    </div>
                </div>
            </div>
        </AppBar>
    )
}

export default function Profile() {
    return (
        <Suspense>
            <_Profile />
        </Suspense>
    )
}