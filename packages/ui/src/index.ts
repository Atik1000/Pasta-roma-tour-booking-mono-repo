/**
 * Public entry point for the shared design system.
 *
 * Everything the public site and the admin panel render comes from here, so a
 * change to a status colour or a card radius lands in both apps at once.
 */
export { cn } from './lib/cn';

// --- primitives ---------------------------------------------------------------
export { Badge, badgeVariants, type BadgeProps } from './components/badge';
export { Button, buttonVariants, type ButtonProps } from './components/button';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  type CardProps,
} from './components/card';
export { Skeleton } from './components/skeleton';
export { Spinner, type SpinnerProps } from './components/spinner';
export { Thumbnail, type ThumbnailProps } from './components/thumbnail';

// --- forms --------------------------------------------------------------------
export { Input, Textarea, type InputProps } from './components/input';
export { FormField, Label, type FormFieldProps } from './components/form-field';
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './components/select';
export { Combobox, type ComboboxOption, type ComboboxProps } from './components/combobox';
export { Checkbox, RadioCard, RadioGroup, Switch } from './components/toggles';
export { QuantityStepper, type QuantityStepperProps } from './components/quantity-stepper';

// --- overlays -----------------------------------------------------------------
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from './components/dialog';
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './components/menus';

// --- disclosure & display ------------------------------------------------------
export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './components/disclosure';

// --- data ---------------------------------------------------------------------
export {
  DataTable,
  type ColumnDef,
  type DataTableProps,
  type SortingState,
} from './components/data-table';
export { Breadcrumb, type BreadcrumbItem } from './components/breadcrumb';
export { Pagination, type PaginationProps } from './components/pagination';
export {
  ROWS_PER_PAGE_OPTIONS,
  TableFooter,
  type TableFooterProps,
} from './components/table-footer';
export {
  FilterPanel,
  FilterRange,
  type FilterPanelProps,
  type FilterRangeProps,
} from './components/filter-panel';

// --- states -------------------------------------------------------------------
export {
  EmptyState,
  ErrorState,
  StatCard,
  type EmptyStateProps,
  type ErrorStateProps,
  type StatCardProps,
} from './components/states';
export { StatusPill, type StatusPillProps } from './components/status-pill';
export { ToastProvider, useToast, type ToastOptions, type ToastTone } from './components/toast';

// --- domain -------------------------------------------------------------------
export {
  PriceBreakdown,
  type PriceBreakdownProps,
  type PriceLine,
} from './components/price-breakdown';
export {
  SectionHeading,
  Timeline,
  type SectionHeadingProps,
  type TimelineStep,
} from './components/section-heading';
export { TourCard, type TourCardProps } from './components/tour-card';
export { Markdown } from './components/markdown';

// --- charts -------------------------------------------------------------------
export {
  AreaChart,
  CHART_COLORS,
  DonutChart,
  type AreaChartProps,
  type DonutChartProps,
  type DonutSlice,
} from './components/charts';
