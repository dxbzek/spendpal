import {
  Baby, Banknote, Bath, Beer, BookOpen, Briefcase, Building2, Bus, Camera, Car, Clapperboard, Coffee,
  CreditCard, Drama, Dumbbell, Flame, Fuel, Gamepad2, Gem, Gift, HandHeart, HeartPulse, House,
  KeyRound, Landmark, Laptop, Lightbulb, type LucideIcon, Music, Package, PartyPopper, PawPrint, Pill,
  Pin, Pizza, Plane, Plug, Receipt, Repeat, Scale, Scissors, Shield, ShoppingBag, ShoppingCart,
  Smartphone, Snowflake, SprayCan, Store, Tag, Target, TrainFront, TreePalm, TrendingUp, Trophy,
  Umbrella, Users, Utensils, Wallet, Wrench, Mail, ChartPie, NotebookPen, Pencil,
} from 'lucide-react';

// Category, account and goal icons are stored as emoji (in the database, in
// AI and statement-import output, in older exports). They are drawn as line
// icons instead; the stored value stays an emoji so nothing has to migrate.
const BY_EMOJI: Record<string, LucideIcon> = {
  '☕': Coffee, '🛒': ShoppingCart, '🚗': Car, '🍽': Utensils, '📱': Smartphone, '🚇': TrainFront,
  '✈': Plane, '🎬': Clapperboard, '🤲': HandHeart, '📦': Package, '💡': Lightbulb, '🏠': House,
  '🏦': Landmark, '🛍': ShoppingBag, '🏥': HeartPulse, '📚': BookOpen, '🔄': Repeat, '🔌': Plug,
  '🛡': Shield, '🏋': Dumbbell, '💪': Dumbbell, '💆': Bath, '📌': Pin, '💰': Wallet, '💻': Laptop,
  '🎁': Gift, '🎉': PartyPopper, '📈': TrendingUp, '🏢': Building2, '🏡': KeyRound, '💵': Banknote,
  '💸': Banknote, '🔁': Repeat, '💳': CreditCard, '🎯': Target, '🏝': TreePalm, '🏖': Umbrella,
  '💍': Gem, '🏪': Store, '⚖': Scale, '🧾': Receipt, '🚌': Bus, '🍕': Pizza, '🎭': Drama,
  '⚽': Trophy, '🔧': Wrench, '📸': Camera, '⛽': Fuel, '💊': Pill, '🎵': Music, '🍺': Beer,
  '🎮': Gamepad2, '🐾': PawPrint, '🧹': SprayCan, '👶': Baby, '💇': Scissors, '🔥': Flame,
  '❄': Snowflake, '👨‍👩‍👧': Users, '💼': Briefcase,
  '✉': Mail, '📊': ChartPie, '📝': NotebookPen, '✏': Pencil,
};

const MODIFIERS = /\uFE0F|\uD83C[\uDFFB-\uDFFF]/g;

export function iconFor(value: string | null | undefined): LucideIcon {
  if (!value) return Tag;
  return BY_EMOJI[value.replace(MODIFIERS, '').trim()] ?? Tag;
}

/** The emoji the pickers offer, in display order. */
export const PICKER_ICONS = Object.keys(BY_EMOJI);
