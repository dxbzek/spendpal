import {
  Baby, Banknote, Bath, Beer, BookOpen, Briefcase, Building2, Bus, Camera, Car, Clapperboard, Coffee,
  CreditCard, Drama, Dumbbell, Flame, Fuel, Gamepad2, Gem, Gift, HandHeart, HeartPulse, House,
  KeyRound, Landmark, Laptop, Lightbulb, type LucideIcon, Music, Package, PartyPopper, PawPrint, Pill,
  Pin, Pizza, Plane, Plug, Receipt, Repeat, Scale, Scissors, Shield, ShoppingBag, ShoppingCart,
  Smartphone, Snowflake, SprayCan, Store, Tag, Target, TrainFront, TreePalm, TrendingUp, Trophy,
  Umbrella, Users, Utensils, Wallet, Wrench, Mail, ChartPie, NotebookPen, Pencil,
  ArrowLeftRight, CarTaxiFront, CircleHelp, Popcorn, Ticket, Tv, Undo2,
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

// Emoji that rows written outside the app carry (the command-line importer and
// the Telegram bot pick their own per category). They were all drawn as the
// fallback tag, so Food, Transport, Family, Subscriptions and Entertainment
// looked the same. Drawn here, but not offered in the pickers: each has a
// twin in BY_EMOJI already.
const ALSO_DRAWN: Record<string, LucideIcon> = {
  '🍔': Utensils, '🍿': Popcorn, '🚕': CarTaxiFront, '👪': Users, '📺': Tv, '🎟': Ticket,
  '🙏': HandHeart, '🏛': Landmark, '↩': Undo2, '↔': ArrowLeftRight, '❓': CircleHelp,
};

export function iconFor(value: string | null | undefined): LucideIcon {
  if (!value) return Tag;
  const key = value.replace(MODIFIERS, '').trim();
  return BY_EMOJI[key] ?? ALSO_DRAWN[key] ?? Tag;
}

/** The emoji the pickers offer, in display order. */
export const PICKER_ICONS = Object.keys(BY_EMOJI);
