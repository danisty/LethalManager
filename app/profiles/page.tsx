'use client'

import { Button, Image, Listbox, ListboxItem, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from "@nextui-org/react";
import { invoke } from "@tauri-apps/api/tauri";
import React, { Key, useCallback, useEffect, useState } from "react";
import AppBar from "@/app/_components/appbar";
import { useRouter } from "next/navigation";
import ContextMenu from "@/app/_components/contextmenu";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import useGameStatus, { GameStatusResult } from "../_utils/gamestatus";

export type ProfileInfo = {
    name: string,
    icon: string,
    mods_amount: number,
    folder: string
};

function Profile({ profile, onDelete, game }: { profile: ProfileInfo, game: GameStatusResult, onDelete: () => void }) {
	const router = useRouter();

	const isProfileRunning = game.status.running && game.status.profile! === profile.name;

	const onAction = useCallback((key: Key, close: () => void) => {
		switch (key) {
			case 'open':
				router.push(`/profiles/profile?name=${profile.name}`);
				break;
			case 'folder':
				invoke('show_in_explorer', { path: profile.folder });
				break;
			case 'delete':
				onDelete();
				break;
			default:
				break;
		}
		close();
	}, [onDelete]);

	return (
		<ContextMenu
			onBuild={(close) => (
				<Listbox onAction={(key) => onAction(key, close)}>
					<ListboxItem key="open">Open</ListboxItem>
					<ListboxItem key="folder">Folder</ListboxItem>
					<ListboxItem key="delete" color="danger" className="text-danger">Delete</ListboxItem>
				</Listbox>
			)}>
			<div className="relative group">
				<Button disableRipple className="flex flex-col items-start gap-0 bg-background-rgb p-4 w-44 h-fit"
					onClick={() => {
						router.push(`/profiles/profile?name=${profile.name}`)
					}}>
					{profile.icon
						? <picture className="bg-primary-rgb rounded-lg w-full overflow-hidden aspect-square shrink-0">
							<div className="bg-cover size-full" style={{ backgroundImage: `url(${convertFileSrc(profile.icon)})` }}></div>
						</picture>
						: <div className="bg-primary-rgb rounded-lg w-full aspect-square"></div>}
					<a title={profile.name} className="pt-2 w-full text-medium text-start break-all overflow-ellipsis overflow-hidden">{profile.name}</a>
					<a className="text-neutral-400">{profile.mods_amount} mods</a>
				</Button>
				<Button disableRipple isIconOnly color={isProfileRunning ? "danger" : "success"} variant="solid"
					className="right-6 bottom-[4.7rem] absolute opacity-0 group-hover:opacity-100 rounded-lg min-w-10 size-[45px!important]"
					onPress={() => {
						if (game.status.running)
							invoke('stop_game').then(game.checkStatus);
						if (!isProfileRunning)
							invoke('play_profile', { name: profile.name }).then(game.checkStatus);
					}}>
					<i className={"m-auto text-lg " + (isProfileRunning ? "ri-stop-fill" : "ri-play-fill")}></i>
				</Button>
			</div>
		</ContextMenu>
	);
}

export default function Profiles() {
    const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
    const [profileName, setProfileName] = useState('');
    const [error, setError] = useState('');
	const [image, setImage] = useState<string>();

	const game = useGameStatus();
    const { isOpen: isCreateProfileOpen, onOpen: onOpenCreateProfile, onOpenChange: onCreateProfileOpenChange } = useDisclosure();
    const { isOpen: isDeleteProfileOpen, onOpen: onOpenDeleteProfile, onOpenChange: onDeleteProfileOpenChange } = useDisclosure();

	const motionProps = React.useMemo(() => ({
		variants: {
		  enter: {
			y: 0,
			opacity: 1,
			transition: {
			  duration: 0.15,
			  ease: "easeIn",
			},
		  },
		  exit: {
			y: 40,
			opacity: 0,
			transition: {
			  duration: 0.15,
			  ease: "easeOut",
			},
		  },
		}
	}), []);

    const getProfiles = () => {
        invoke<ProfileInfo[]>('get_profiles')
            .then(p => setProfiles(p))
            .catch(e => console.log(e));
    };

    const onCreateProfile = (onClose: () => void) => {
        invoke('create_profile', { name: profileName, icon: image })
            .then(() => {
				getProfiles();
				onClose();
			})
            .catch(setError);
    }

    useEffect(getProfiles, []);

    return (
        <AppBar>
			<div className="flex flex-col p-4">
				<div className="flex flex-row items-center gap-4 pb-4">
					<a>Profiles</a>
					<Button isIconOnly disableRipple size="sm" color="success"
						onPress={() => {
							setError('');
							setImage(undefined);
							onOpenCreateProfile();
						}}>
						<i className="text-medium ri-add-line"></i>
					</Button>
				</div>
				<div className="flex flex-row gap-4">
					{profiles.map((profile, i) => <Profile key={i} profile={profile} game={game} onDelete={() => {
						setProfileName(profile.name);
						onOpenDeleteProfile();
					}} />)}
				</div>
				<Modal isOpen={isCreateProfileOpen}
					hideCloseButton
					onOpenChange={onCreateProfileOpenChange}
					motionProps={motionProps}
					classNames={{
						header: "border-b-[1px] bg-background-rgb p-4 border-[#252525]",
						body: "bg-background-rgb p-4",
						footer: "border-t-[1px] bg-background-rgb p-4 border-[#252525]"
					}}>
					<ModalContent>{(onClose) => (<>
						<ModalHeader>
							Add profile
						</ModalHeader>
						<ModalBody className="flex flex-row gap-4">
							<input hidden id="image_selector" type="file" accept="image/*" onChange={(e) => {
								if (e.target.files && e.target.files.length) {
									const fr = new FileReader();
									fr.readAsDataURL(e.target.files[0]);
									fr.onloadend = () => setImage(fr.result as string);
								}
							}} />
							<label htmlFor="image_selector" className="shrink-0">
								<div className="bg-primary-rgb bg-cover rounded-lg cursor-pointer size-24" style={{ "backgroundImage": `url(${image})` }}></div>
							</label>
							<div className="flex flex-col gap-1 w-full">
								<a>Profile name</a>
								<input autoFocus className="bg-primary-rgb p-2 rounded-lg w-full h-10"
									onKeyDown={(e) => e.key == 'Enter' &&  onCreateProfile(onClose)}
									onChange={e => setProfileName(e.target.value)} />
								{error !== '' && <a className="text-red-400">{error}</a>}
							</div>
						</ModalBody>
						<ModalFooter>
							<Button className="h-9" 
								onPress={onClose}>
								Cancel
							</Button>
							<Button color="primary" className="h-9" onPress={() => onCreateProfile(onClose)}>
								Add
							</Button>
						</ModalFooter>
					</>)}
					</ModalContent>
				</Modal>
				<Modal isOpen={isDeleteProfileOpen}
					hideCloseButton
					onOpenChange={onDeleteProfileOpenChange}
					motionProps={motionProps}
					classNames={{
						header: "bg-background-rgb p-4 border-[#252525]",
						footer: "border-t-[1px] bg-background-rgb p-4 border-[#252525]"
					}}>
					<ModalContent>{(onClose) => (<>
						<ModalHeader>
							<a>Do you want to delete profile <a className="text-blue-400">{profileName}</a>?</a>
						</ModalHeader>
						<ModalFooter>
							<Button onPress={onClose} className="h-9">
								Cancel
							</Button>
							<Button color="danger" className="h-9" onPress={() => {
								invoke('delete_profile', { name: profileName }).then(() => {
									getProfiles();
									onClose();
								});
							}}>
								Delete
							</Button>
						</ModalFooter>
					</>)}
					</ModalContent>
				</Modal>
			</div>
		</AppBar>
    );
}