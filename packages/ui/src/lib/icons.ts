/**
 * Every icon in the product, drawn from Tabler.
 *
 * The names here are the ones the components already import, so where an icon
 * comes from is decided in this one file: changing the set, or swapping a
 * single glyph, never means touching the hundred files that use them. New
 * icons are added here first and imported from here, never from the icon
 * package directly.
 *
 * The approach, one adapter module in front of Tabler, follows Synara (MIT),
 * Copyright (c) 2026 T3 Tools Inc. and Emanuele Di Pietro.
 */
import { createElement, type ComponentType, type SVGProps } from "react";
import {
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconAlertOctagon,
  IconAlertTriangle,
  IconArchive,
  IconArrowDown,
  IconArrowDownRight,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconArrowUpRight,
  IconBook,
  IconBook2,
  IconBookmark,
  IconBrain,
  IconBuilding,
  IconCalendar,
  IconChartPie,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCircle,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleDot,
  IconCircleX,
  IconClock,
  IconCloud,
  IconCode,
  IconCoins,
  IconCopy,
  IconCornerDownLeft,
  IconCpu,
  IconDatabase,
  IconDeviceDesktop,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDevices,
  IconDots,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconFile,
  IconFileCheck,
  IconFileSearch,
  IconFileText,
  IconFiles,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconGenderBigender,
  IconGenderFemale,
  IconGenderGenderqueer,
  IconGenderMale,
  IconGenderTransgender,
  IconGitCommit,
  IconHistory,
  IconInfoCircle,
  IconKey,
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconLayoutSidebarRightCollapse,
  IconList,
  IconLoader2,
  IconLock,
  IconLogout,
  IconMail,
  IconMailOpened,
  IconMenu2,
  IconMessage,
  IconMessage2,
  IconMessageCircle,
  IconMicrophone,
  IconMinus,
  IconMoon,
  IconMusic,
  IconNetwork,
  IconPackage,
  IconPackages,
  IconPalette,
  IconPaperclip,
  IconPencil,
  IconPhoto,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlug,
  IconPlus,
  IconPoint,
  IconPointFilled,
  IconPuzzle,
  IconQuote,
  IconRefresh,
  IconRepeat,
  IconRocket,
  IconRosetteDiscountCheck,
  IconRotate,
  IconSearch,
  IconSelector,
  IconServer,
  IconSettings,
  IconShield,
  IconShieldCheck,
  IconSparkles,
  IconSquare,
  IconStack2,
  IconSun,
  IconTable,
  IconTerminal2,
  IconTool,
  IconTrash,
  IconUpload,
  IconUser,
  IconUserPlus,
  IconUsers,
  IconVideo,
  IconWifiOff,
  IconWorld,
  IconX,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

export type IconProps = SVGProps<SVGSVGElement> & {
  /** Edge length in px, where a size class is not the better tool. */
  size?: number | string;
  /** Tabler calls this `stroke`; the components here were written against `strokeWidth`. */
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
};

export type Icon = ComponentType<IconProps>;
/** The names the components were written against. */
export type LucideIcon = Icon;
export type LucideProps = IconProps;

/**
 * Tabler draws at a stroke of 2, which reads heavy at the 16px most of the
 * interface uses. A touch lighter matches the weight of the type beside it.
 */
const STROKE = 1.75;

function adapt(Component: TablerIcon): Icon {
  function Adapted({ strokeWidth, absoluteStrokeWidth: _unused, size, ...props }: IconProps) {
    // `createElement` rather than JSX so this stays a plain `.ts` module, which
    // is the only kind this package's `./lib/*` export resolves.
    return createElement(Component, {
      // A size class wins over this, exactly as it did before.
      size: size ?? 24,
      stroke: strokeWidth === undefined ? STROKE : Number(strokeWidth),
      "aria-hidden": props["aria-label"] ? undefined : true,
      ...(props as object),
    });
  }
  Adapted.displayName = Component.displayName;
  return Adapted;
}

export const AlertCircle = adapt(IconAlertCircle);
export const AlertCircleIcon = adapt(IconAlertCircle);
export const AlertTriangleIcon = adapt(IconAlertTriangle);
export const ArchiveIcon = adapt(IconArchive);
export const ArrowDownIcon = adapt(IconArrowDown);
export const ArrowDownRightIcon = adapt(IconArrowDownRight);
export const ArrowLeftIcon = adapt(IconArrowLeft);
export const ArrowRight = adapt(IconArrowRight);
export const ArrowRightIcon = adapt(IconArrowRight);
export const ArrowUpIcon = adapt(IconArrowUp);
export const ArrowUpRightIcon = adapt(IconArrowUpRight);
export const BadgeCheckIcon = adapt(IconRosetteDiscountCheck);
export const BlocksIcon = adapt(IconPuzzle);
export const BookIcon = adapt(IconBook);
export const BookOpenIcon = adapt(IconBook2);
export const BookmarkIcon = adapt(IconBookmark);
export const BoxesIcon = adapt(IconPackages);
export const BrainIcon = adapt(IconBrain);
export const BuildingIcon = adapt(IconBuilding);
export const CalendarIcon = adapt(IconCalendar);
export const CheckCircle2Icon = adapt(IconCircleCheck);
export const CheckCircleIcon = adapt(IconCircleCheck);
export const CheckIcon = adapt(IconCheck);
export const ChevronDownIcon = adapt(IconChevronDown);
export const ChevronLeftIcon = adapt(IconChevronLeft);
export const ChevronRightIcon = adapt(IconChevronRight);
export const ChevronUpIcon = adapt(IconChevronUp);
export const ChevronsUpDownIcon = adapt(IconSelector);
export const CircleCheckIcon = adapt(IconCircleCheck);
export const CircleDashedIcon = adapt(IconCircleDashed);
export const CircleDotIcon = adapt(IconCircleDot);
export const CircleIcon = adapt(IconCircle);
export const CircleSmallIcon = adapt(IconPointFilled);
export const CircleX = adapt(IconCircleX);
export const ClockIcon = adapt(IconClock);
export const CloudIcon = adapt(IconCloud);
export const Code = adapt(IconCode);
export const CodeIcon = adapt(IconCode);
export const CoinsIcon = adapt(IconCoins);
export const CopyIcon = adapt(IconCopy);
export const CornerDownLeftIcon = adapt(IconCornerDownLeft);
export const CpuIcon = adapt(IconCpu);
export const DatabaseIcon = adapt(IconDatabase);
export const DotIcon = adapt(IconPoint);
export const DownloadIcon = adapt(IconDownload);
export const ExternalLinkIcon = adapt(IconExternalLink);
export const EyeIcon = adapt(IconEye);
export const EyeOffIcon = adapt(IconEyeOff);
export const FileCheckIcon = adapt(IconFileCheck);
export const FileIcon = adapt(IconFile);
export const FileSearchIcon = adapt(IconFileSearch);
export const FileTextIcon = adapt(IconFileText);
export const FilesIcon = adapt(IconFiles);
export const FolderIcon = adapt(IconFolder);
export const FolderOpenIcon = adapt(IconFolderOpen);
export const FolderPlusIcon = adapt(IconFolderPlus);
export const GitCommitIcon = adapt(IconGitCommit);
export const GlobeIcon = adapt(IconWorld);
export const HistoryIcon = adapt(IconHistory);
export const ImageIcon = adapt(IconPhoto);
export const InfoIcon = adapt(IconInfoCircle);
export const KeyRoundIcon = adapt(IconKey);
export const LaptopIcon = adapt(IconDeviceLaptop);
export const LayersIcon = adapt(IconStack2);
export const ListIcon = adapt(IconList);
export const Loader2 = adapt(IconLoader2);
export const Loader2Icon = adapt(IconLoader2);
export const LockIcon = adapt(IconLock);
export const LogOutIcon = adapt(IconLogout);
export const MailIcon = adapt(IconMail);
export const MailOpenIcon = adapt(IconMailOpened);
export const MarsIcon = adapt(IconGenderMale);
export const MarsStrokeIcon = adapt(IconGenderMale);
export const MenuIcon = adapt(IconMenu2);
export const MessageCircleIcon = adapt(IconMessageCircle);
export const MessageSquareIcon = adapt(IconMessage);
export const MessageSquareTextIcon = adapt(IconMessage2);
export const MicIcon = adapt(IconMicrophone);
export const MinusIcon = adapt(IconMinus);
export const Monitor = adapt(IconDeviceDesktop);
export const MonitorIcon = adapt(IconDeviceDesktop);
export const MonitorSmartphoneIcon = adapt(IconDevices);
export const Moon = adapt(IconMoon);
export const MoonIcon = adapt(IconMoon);
export const MoreHorizontalIcon = adapt(IconDots);
export const Music2Icon = adapt(IconMusic);
export const NetworkIcon = adapt(IconNetwork);
export const NonBinaryIcon = adapt(IconGenderGenderqueer);
export const OctagonXIcon = adapt(IconAlertOctagon);
export const PackageIcon = adapt(IconPackage);
export const PaletteIcon = adapt(IconPalette);
export const PanelLeftIcon = adapt(IconLayoutSidebar);
export const PanelRightCloseIcon = adapt(IconLayoutSidebarRightCollapse);
export const PanelRightIcon = adapt(IconLayoutSidebarRight);
export const PaperclipIcon = adapt(IconPaperclip);
export const PauseIcon = adapt(IconPlayerPause);
export const PencilIcon = adapt(IconPencil);
export const PieChartIcon = adapt(IconChartPie);
export const PlayIcon = adapt(IconPlayerPlay);
export const PlugIcon = adapt(IconPlug);
export const PlusIcon = adapt(IconPlus);
export const QuoteIcon = adapt(IconQuote);
export const RefreshCwIcon = adapt(IconRefresh);
export const RepeatIcon = adapt(IconRepeat);
export const RocketIcon = adapt(IconRocket);
export const RotateCcwIcon = adapt(IconRotate);
export const SearchIcon = adapt(IconSearch);
export const ServerIcon = adapt(IconServer);
export const SettingsIcon = adapt(IconSettings);
export const ShieldCheckIcon = adapt(IconShieldCheck);
export const ShieldIcon = adapt(IconShield);
export const SlidersHorizontalIcon = adapt(IconAdjustmentsHorizontal);
export const SmartphoneIcon = adapt(IconDeviceMobile);
export const SparklesIcon = adapt(IconSparkles);
export const SquareIcon = adapt(IconSquare);
export const SquarePenIcon = adapt(IconEdit);
export const Sun = adapt(IconSun);
export const SunIcon = adapt(IconSun);
export const TableIcon = adapt(IconTable);
export const TabletIcon = adapt(IconDeviceTablet);
export const TerminalIcon = adapt(IconTerminal2);
export const TransgenderIcon = adapt(IconGenderTransgender);
export const Trash2Icon = adapt(IconTrash);
export const TriangleAlertIcon = adapt(IconAlertTriangle);
export const UploadIcon = adapt(IconUpload);
export const UserIcon = adapt(IconUser);
export const UserPlusIcon = adapt(IconUserPlus);
export const UsersIcon = adapt(IconUsers);
export const VenusAndMarsIcon = adapt(IconGenderBigender);
export const VenusIcon = adapt(IconGenderFemale);
export const VideoIcon = adapt(IconVideo);
export const WifiOffIcon = adapt(IconWifiOff);
export const WrenchIcon = adapt(IconTool);
export const XCircleIcon = adapt(IconCircleX);
export const XIcon = adapt(IconX);
