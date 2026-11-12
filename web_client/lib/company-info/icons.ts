/**
 * The closed set of icons the company info can name (`iconNameSchema`): FAQ
 * categories, About excellences, home service cards. The admin console picks from
 * the same list, so every name stored in Firestore has an icon here.
 */
import {
    Award,
    CheckCircle,
    Clock,
    Coins,
    FileText,
    Hammer,
    HardHat,
    Home,
    LayoutDashboard,
    Leaf,
    MapPin,
    Phone,
    Shield,
    Sparkles,
    Wand2,
    Wrench,
    type LucideIcon,
} from 'lucide-react';
import type { IconName } from '@/types/company-info';

export const COMPANY_ICONS: Record<IconName, LucideIcon> = {
    Coins,
    FileText,
    Sparkles,
    Wrench,
    Award,
    Shield,
    Leaf,
    LayoutDashboard,
    Wand2,
    HardHat,
    CheckCircle,
    Phone,
    Clock,
    MapPin,
    Hammer,
    Home,
};
