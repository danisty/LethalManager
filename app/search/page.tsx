'use client'

import "../globals.css"
import { Image, Button, Checkbox, Chip, Progress, useDisclosure, ModalContent, Modal, Pagination, Select, SelectItem, ModalHeader, ModalFooter } from "@nextui-org/react";
import { convertFileSrc, invoke } from "@tauri-apps/api/tauri";
import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePersistedState } from "@/app/_utils/state";
import AppBar from "@/app/_components/appbar";
import { useSearchParams } from "next/navigation";
import { UnlistenFn, listen } from "@tauri-apps/api/event";
import { Profile } from "../profiles/profile/page";
import { ProfileInfo } from "../profiles/page";

type Data = {
    categories: string[],
    mods: Mod[],
    pages: number
};

type DownloadProgress = {
    current_mod: string,
    total_progress: number,
    extract_progress: number
};

export type ModInfo = {
    name: string,
    full_name: string,
    description: string,
    author: string,
    version_number: string,
    dependencies: string,
    icon?: string,
    enabled: boolean,
    folder: string
};

export type Mod = {
    categories: string[],
    date_created: string,
    date_updated: string,
    full_name: string,
    has_nsfw_content: boolean,
    is_deprecated: boolean,
    is_pinned: boolean,
    name: string,
    owner: string,
    package_url: string,
    rating_score: number,
    uuid4: string,
    versions: Version[]
};

export type Version = {
    date_created: string,
    dependencies: string[],
    description: string,
    download_url: string,
    downloads: number,
    file_size: number,
    full_name: string,
    icon: string,
    is_active: boolean,
    name: string,
    uuid4: string,
    version_number: string,
    website_url: string,
};

function _SearchTab() {
    const params = useSearchParams();
    const selectedProfile: Profile | undefined = params.get('profile') ? JSON.parse(params.get('profile')!) : undefined;

    const [profiles, setProfiles] = useState<ProfileInfo[]>();
    const [selectedMod, setSelectedMod] = useState<Mod>();
    
    const [query, setQuery] = usePersistedState('search_query', '');
    const [data, setData] = usePersistedState<Data>('search_data', { categories: [], mods: [], pages: 0 });
    const [types, setTypes] = usePersistedState<Record<string, number>>('search_types', { Mods: 0, Modpacks: 0 });
    const [categories, setCategories] = usePersistedState<Record<string, boolean>>('search_categories', {});
    const [scroll, setScroll] = usePersistedState('search_scroll_position', 0);
    const [sortOrder, setSortOrder] = usePersistedState('search_sort_order', 'rating');
    const [page, setPage] = usePersistedState('search_page', 0);

    const { isOpen: isDownloadProgressOpen, onOpen: onOpenDownloadProgress, onClose: onCloseDownloadProgress } = useDisclosure();
    const { isOpen: isProfileSelectionOpen, onOpen: onOpenProfileSelection, onClose: onCloseProfileSelection } = useDisclosure();

    const [loading, setLoading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>();

    const ref = useRef<HTMLDivElement>(null);

    const getProfiles = () => {
        invoke<ProfileInfo[]>('get_profiles')
            .then(p => setProfiles(p))
            .catch(e => console.log(e));
    };

    const search = useCallback((query: string, page: number, sort: string, loading: boolean = false) => {
        setQuery(query);
        setSortOrder(sort);
        setLoading(loading);
        invoke<Data>('search', {
            query, page, sort,
            categories: Object.entries(categories).filter(([_, x]) => x).map(([x, _]) => x),
            types
        }).then(data => {
            setData(data);
            setPage(page);
            setLoading(false);
            ref.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }).catch(_ => {});
    }, [categories, types]);

    const download = useCallback((versionName: string, profile?: Profile) => {
        if (profile) {
            if (isProfileSelectionOpen) {
                onCloseProfileSelection();
            }
            invoke('download_mod', {
                profileName: profile.name,
                versionName
            }).then(getProfiles);
        } else {
            onOpenProfileSelection();
        }
    }, [selectedProfile, isProfileSelectionOpen]);

    const getDays = useCallback((date: string) => {
        return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 3600 * 24));
    }, []);

    const toggleType = useCallback((type: string) => {
        if (++types[type] > 1) {
            types[type] = -1;
        }
        setTypes({...types});
        search(query, 0, sortOrder, true);
    }, [query, types, sortOrder]);

    const setCategory = useCallback((category: string, state: boolean) => {
        categories[category] = state;
        setCategories({...categories});
        search(query, 0, sortOrder, true);
    }, [query, categories, sortOrder]);

    const clearFilters = useCallback(() => {
        types.Mods = 0;
        types.Modpacks = 0;
        for (let c in categories) {
            categories[c] = false;
        }
        search(query, page, sortOrder, true);
    }, [query, page, types, categories, sortOrder]);

    const changeSortOrder = useCallback((sortOrder: string) => {
        search(query, 0, sortOrder, true);
    }, [search, query]);

    const pagination = React.useMemo(() => (
        <div className="flex justify-center">
            <Pagination key={sortOrder} showControls total={data.pages} initialPage={1} page={page + 1}
                onChange={(p) => search(query, p - 1, sortOrder, true)}
                classNames={{ item: "bg-background-rgb", next: "bg-background-rgb", prev: "bg-background-rgb" }} />
        </div>
    ), [data]);

    useEffect(() => {
        // Search
        if (data.categories.length === 0 && data.mods.length === 0 && query.length === 0) {
            search(query, page, sortOrder, true);
        }

        // Load profiles
        getProfiles();

        // Restore scroll position
        ref.current?.scrollTo({
            top: scroll
        });

        // Save scroll position
        const interval = setInterval(() => {
            if (ref.current) setScroll(ref.current.scrollTop);
        }, 500);

        // Events
        let open = isDownloadProgressOpen;
        let unlisten: UnlistenFn;
        listen<DownloadProgress>('download_progress', (e) => {
            setDownloadProgress(e.payload);
            if (e.payload.total_progress >= 0 && !open) {
                open = true;
                onOpenDownloadProgress();
            } else if (e.payload.total_progress == 100) {
                open = false;
                setTimeout(onCloseDownloadProgress, 50);
            }
        }).then(u => unlisten = u);

        return () => {
            if (unlisten) unlisten();
            clearInterval(interval);
        }
    }, []);

    return (
        <AppBar>
            <div className="relative flex flex-row h-full">
                {loading && <Progress
                    size="sm"
                    isIndeterminate
                    aria-label="Loading..."
                    radius="none"
                    className="z-10 absolute w-[102%] clip"
                    />}
                <div className="flex flex-col gap-4 py-4 pl-4 w-[240px] h-full overflow-auto scrollbar-hide">
                    {selectedProfile !== undefined && <div className="flex flex-row gap-3 bg-[#0d1830] p-3 rounded-xl w-full">
                        {selectedProfile.icon
                            ? <picture className="bg-primary-rgb rounded-lg overflow-hidden aspect-square shrink-0 size-12">
                                <div className="bg-cover size-full" style={{ backgroundImage: `url(${convertFileSrc(selectedProfile.icon)})` }}></div>
                            </picture>
                            : <div className="bg-primary-rgb rounded-lg aspect-square size-12"></div>}
                        <div className="flex flex-col overflow-hidden">
                            <a className="font-bold">Profile selected</a>
                            <a>{selectedProfile.name}</a>
                        </div>
                    </div>}
                    <div className="flex flex-col gap-1 bg-background-rgb p-3 rounded-xl w-full">
                        <Button disableRipple startContent={<i className="text-lg ri-close-circle-line"></i>} className="rounded-lg"
                            onPress={clearFilters}>
                            Clear filters
                        </Button>
                        <div className="flex flex-col gap-1 pt-1">
                            <a className="py-1 font-bold text-base">Types</a>
                            <Checkbox isIndeterminate={types.Mods == -1} isSelected={types.Mods == 1} className="mr-4 min-w-full"
                                classNames={{ base: "pb-3 pt-1" }}
                                onValueChange={() => toggleType("Mods")}>Mods</Checkbox>
                            <Checkbox isIndeterminate={types.Modpacks == -1} isSelected={types.Modpacks == 1} className="mr-4 min-w-full"
                                classNames={{ base: "pb-3 pt-1" }}
                                onValueChange={() => toggleType("Modpacks")}>Modpacks</Checkbox>
                            <a className="py-1 font-bold text-base">Categories</a>
                            {data.categories.map((c, i) => (
                                <Checkbox key={i} isSelected={categories[c]} className="mr-4 min-w-full"
                                    classNames={{ base: "pb-3 pt-1" }}
                                    onValueChange={s => setCategory(c, s)}>{c}</Checkbox>
                            ))}
                        </div>
                    </div>
                </div>
                <div ref={ref} className="flex-1 p-4 w-0 overflow-auto">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-row gap-3 bg-background-rgb p-3 pb-3 rounded-xl">
                            <div className="relative flex-grow">
                                <input
                                    className="bg-primary-rgb p-2 rounded-lg w-full h-9"
                                    placeholder="Search mod..."
                                    value={query}
                                    onChange={(e) => {
                                        search(e.target.value, 0, sortOrder);
                                    }}/>
                                <button className="right-2 absolute h-full" onClick={() => search('', page, sortOrder, true)}>
                                    <i className="text-lg ri-close-line"></i>
                                </button>
                            </div>
                            <Select
                                disallowEmptySelection
                                selectedKeys={[sortOrder]}
                                labelPlacement="outside-left"
                                label="Sort by"
                                onChange={e => {
                                    changeSortOrder(e.target.value)
                                }}
                                className="max-w-[200px]"
                                classNames={{
                                    base: "flex items-center",
                                    label: "whitespace-nowrap",
                                    trigger: "min-h-0 h-9",
                                }}>
                                <SelectItem key="rating" value="rating">Rating</SelectItem>
                                <SelectItem key="created" value="created">Newest</SelectItem>
                                <SelectItem key="updated" value="updated">Updated</SelectItem>
                                <SelectItem key="downloads" value="downloads">Downloads</SelectItem>
                                <SelectItem key="name" value="name">Name</SelectItem>
                            </Select>
                        </div>
                        {data.pages !== 0 && pagination}
                        {data.mods.map((m, i) => (
                            <Button disableRipple key={i} className="flex flex-col items-start gap-3 bg-background-rgb p-3 h-fit">
                                <div className="flex flex-row gap-3 w-full">
                                    <Image
                                        alt={m.full_name}
                                        src={m.versions[0].icon}
                                        width={96}
                                        height={96}
                                        className="bg-primary-rgb rounded-lg"
                                        classNames={{
                                            wrapper: "shrink-0"
                                        }}>
                                    </Image>
                                    <div className="flex flex-col min-w-0 h-24 text-start">
                                        <a className="font-bold text-[1.4rem] leading-5">{m.name}</a>
                                        <a title={m.versions[0].description}
                                           className="my-auto line-clamp-2 min-w-0 text-[1rem] text-ellipsis text-neutral-400 text-start text-wrap overflow-hidden">
                                            {m.versions[0].description}
                                        </a>
                                        <div className="flex flex-row gap-2 overflow-auto scrollbar-hide">
                                            {m.categories.map((c, i) => (
                                                <Chip size="md" key={i} variant="bordered" className="rounded-lg">{c}</Chip>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-row items-stretch gap-3 w-full h-8">
                                    <Chip variant="solid" className="rounded-lg h-full"><i className="pr-2 ri-bard-fill"></i>{m.rating_score}</Chip>
                                    <Chip variant="solid" className="rounded-lg h-full"><i className="pr-2 ri-download-line"></i>{m.versions[0].downloads}</Chip>
                                    <Chip variant="solid" className="rounded-lg h-full"><i className="pr-2 ri-information-line"></i>{m.versions[0].version_number}</Chip>
                                    <div className="flex-grow"></div>
                                    <div className="flex flex-row items-center text-ellipsis text-medium text-neutral-500 overflow-hidden">
                                        <i className="pr-2 ri-refresh-line"></i>
                                        {`Updated ${getDays(m.date_updated)} days ago`}
                                    </div>
                                    <Button disableRipple className="flex items-center bg-primary px-4 rounded-lg h-full"
                                        onPress={() => {
                                            setSelectedMod(m);
                                            download(m.versions[0].full_name, selectedProfile)
                                        }}>
                                        Install
                                    </Button>
                                </div>
                            </Button>
                        ))}
                        {data.pages !== 0 && pagination}
                    </div>
                </div>
            </div>
            <Modal hideCloseButton
                isOpen={isDownloadProgressOpen}>
                <ModalContent>{() => (
                    <div className="flex flex-col gap-2 p-4">
                        <a className="flex-grow">{downloadProgress?.current_mod}</a>
                        <Progress disableAnimation showValueLabel={true} label="" value={downloadProgress?.total_progress}/>
                        <Progress disableAnimation showValueLabel={true} label="" value={downloadProgress?.extract_progress}/>
                    </div>
                )}</ModalContent>
            </Modal>
            <Modal hideCloseButton
                isOpen={isProfileSelectionOpen}
                onClose={onCloseProfileSelection}
                classNames={{
                    header: "border-b-[1px] bg-background-rgb p-4 border-[#353535]",
                    footer: "border-t-[1px] bg-background-rgb p-4 border-[#353535]"
                }}>
                <ModalContent>{() => (<>
                    <ModalHeader>
                        <a>Select a profile</a>
                    </ModalHeader>
                    {profiles!.length !== 0 && <div className="flex flex-col gap-2 bg-background-rgb p-4">
                        {profiles!.map((profile: ProfileInfo) => (
                            <div key={profile.name} className="flex flex-row items-center">
                                <a className="flex-grow">{profile.name}</a>
                                <Button disableRipple className="flex items-center bg-primary px-4 rounded-lg h-8"
                                    onPress={() => download(selectedMod!.versions[0].full_name, profile)}>
                                    Install
                                </Button>
                            </div>
                        ))}
                    </div>}
                    {!profiles!.some(p => p.name == selectedMod?.name) && <ModalFooter>
                        <Button disableRipple color="default" className="flex items-center px-4 rounded-lg w-full h-8"
                            onPress={() => {
                                invoke('create_profile', {
                                    name: selectedMod!.name,
                                    icon: selectedMod!.versions[0].icon
                                }).then(() =>
                                    download(selectedMod!.versions[0].full_name, { name: selectedMod!.name, folder: '', icon: '' })
                                );
                            }}>
                            <a className="w-full break-all overflow-ellipsis overflow-hidden">
                                Create a new profile <a className="text-blue-400">{selectedMod!.name}</a>
                            </a>
                        </Button>
                    </ModalFooter>}
                </>)}</ModalContent>
            </Modal>
        </AppBar>
    )
}

export default function SearchTab() {
    return (
        <Suspense>
            <_SearchTab />
        </Suspense>
    )
}
