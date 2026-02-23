import * as React from "react"
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table"
import { MoreHorizontal, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

/**
 * DataTablePro Example
 * Demonstrates a high-fidelity Shadcn Table pattern.
 */
export function DataTablePro() {
    // Columns definition (placeholder for demo)
    const columns: ColumnDef<any>[] = [
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => (
                <div className="capitalize font-medium text-indigo-400">
                    {row.getValue("status")}
                </div>
            ),
        },
        {
            accessorKey: "amount",
            header: () => <div className="text-right">Amount</div>,
            cell: ({ row }) => {
                const amount = parseFloat(row.getValue("amount"))
                return <div className="text-right font-mono font-bold">$ {amount.toFixed(2)}</div>
            },
        },
        {
            id: "actions",
            cell: ({ row }) => {
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-neutral-900 border-white/10 text-white">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(row.original.id)}>
                                Copy payment ID
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-white/10" />
                            <DropdownMenuItem>View customer</DropdownMenuItem>
                            <DropdownMenuItem>View payment details</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            },
        },
    ]

    const table = useReactTable({
        data: [{ id: "1", status: "success", amount: 1250.00 }, { id: "2", status: "pending", amount: 450.00 }],
        columns,
        getCoreRowModel: getCoreRowModel(),
    })

    return (
        <div className="w-full rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden p-4">
            <Table>
                <TableHeader className="bg-white/5 border-none">
                    {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id} className="hover:bg-transparent border-none">
                            {headerGroup.headers.map((header) => (
                                <TableHead key={header.id} className="text-neutral-400 uppercase text-[10px] tracking-widest font-bold">
                                    {header.isPlaceholder
                                        ? null
                                        : flexRender(header.column.columnDef.header, header.getContext())}
                                </TableHead>
                            ))}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {table.getRowModel().rows?.length ? (
                        table.getRowModel().rows.map((row) => (
                            <TableRow key={row.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id}>
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={columns.length} className="h-24 text-center">
                                No results.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
