// Vibe Code Version
"use client"

import { useState, useMemo, useEffect } from "react"
import { RiAlertFill, RiInformationLine } from "react-icons/ri"
import {
    useChainId,
    useWriteContract,
    useAccount,
    useWaitForTransactionReceipt,
    useReadContracts,
} from "wagmi"
import { chainsToTSender, tsenderAbi, erc20Abi } from "@/constants"
import { readContract } from "@wagmi/core"
import { useConfig } from "wagmi"
import { CgSpinner } from "react-icons/cg"
import { formatTokenAmount } from "@/utils"
import { InputForm } from "./ui/InputField"
import { Tabs, TabsList, TabsTrigger } from "./ui/Tabs"
import { waitForTransactionReceipt } from "@wagmi/core"
import { parseUnits } from 'viem'

interface AirdropFormProps {
    isUnsafeMode: boolean
    onModeChange: (unsafe: boolean) => void
}

export default function AirdropForm({ isUnsafeMode, onModeChange }: AirdropFormProps) {
    const [tokenAddress, setTokenAddress] = useState("")
    const [recipients, setRecipients] = useState("")
    const [amounts, setAmounts] = useState("")
    const config = useConfig()
    const account = useAccount()
    const chainId = useChainId()
    const { data: tokenData } = useReadContracts({
        contracts: [
            {
                abi: erc20Abi,
                address: tokenAddress as `0x${string}`,
                functionName: "decimals",
            },
            {
                abi: erc20Abi,
                address: tokenAddress as `0x${string}`,
                functionName: "name",
            },
            {
                abi: erc20Abi,
                address: tokenAddress as `0x${string}`,
                functionName: "balanceOf",
                args: [account.address!],
            },
        ],
    })
    const [hasEnoughTokens, setHasEnoughTokens] = useState(true)
    const [amountsError, setAmountsError] = useState<string | null>(null)

    const { data: hash, isPending, error, writeContractAsync } = useWriteContract()
    const { isLoading: isConfirming, isSuccess: isConfirmed, isError } = useWaitForTransactionReceipt({
        confirmations: 1,
        hash,
    })

    // Get token decimals
    const decimals = tokenData?.[0]?.result as number | undefined;

    const { totalInWei, amountsValid } = useMemo(() => {
        if (!decimals) return { totalInWei: BigInt(0), amountsValid: true };
        
        let total = BigInt(0);
        let isValid = true;
        const amountsArray = amounts.split(/[,\n]+/)
            .map(amt => amt.trim())
            .filter(amt => amt !== '');
        
        for (const amt of amountsArray) {
            try {
                total += parseUnits(amt, decimals);
            } catch (error) {
                isValid = false;
            }
        }
        
        return { totalInWei: total, amountsValid: isValid };
    }, [amounts, decimals]);

    async function handleSubmit() {
        if (!decimals) {
            alert("Token decimals not available");
            return;
        }
        
        const contractType = isUnsafeMode ? "no_check" : "tsender"
        const tSenderAddress = chainsToTSender[chainId][contractType]
        
        if (!tSenderAddress) {
            alert("This chain only has the safer version!");
            return;
        }

        // Prepare recipients and amounts lists
        const recipientsList = recipients.split(/[,\n]+/)
            .map(addr => addr.trim())
            .filter(addr => addr !== '');
            
        const amountsList = amounts.split(/[,\n]+/)
            .map(amt => amt.trim())
            .filter(amt => amt !== '');

        // Validate inputs
        if (recipientsList.length === 0 || amountsList.length === 0) {
            alert("Recipients and amounts cannot be empty");
            return;
        }
        
        if (recipientsList.length !== amountsList.length) {
            alert("Number of recipients must match number of amounts");
            return;
        }
        
        if (!amountsValid) {
            alert("One or more amounts are invalid");
            return;
        }

        // Convert amounts to wei safely
        let amountsWei: bigint[];
        try {
            amountsWei = amountsList.map(amt => parseUnits(amt, decimals));
        } catch (error) {
            alert(`Invalid amount format: ${error instanceof Error ? error.message : error}`);
            return;
        }

        // Calculate total from valid amounts
        const totalToSend = amountsWei.reduce((sum, amt) => sum + amt, BigInt(0));

        const result = await getApprovedAmount(tSenderAddress)

        if (result < totalToSend) {
            // Need approval
            const approvalHash = await writeContractAsync({
                abi: erc20Abi,
                address: tokenAddress as `0x${string}`,
                functionName: "approve",
                args: [tSenderAddress as `0x${string}`, totalToSend],
            })
            const approvalReceipt = await waitForTransactionReceipt(config, {
                hash: approvalHash,
            })

            console.log("Approval confirmed:", approvalReceipt)
        }

        // Execute airdrop
        await writeContractAsync({
            abi: tsenderAbi,
            address: tSenderAddress as `0x${string}`,
            functionName: "airdropERC20",
            args: [
                tokenAddress,
                recipientsList,
                amountsWei,
                totalToSend,
            ],
        })
    }

    async function getApprovedAmount(tSenderAddress: string): Promise<bigint> {
        const response = await readContract(config, {
            abi: erc20Abi,
            address: tokenAddress as `0x${string}`,
            functionName: "allowance",
            args: [account.address!, tSenderAddress as `0x${string}`],
        })
        return response as bigint;
    }

    function getButtonContent() {
        if (isPending)
            return (
                <div className="flex items-center justify-center gap-2 w-full">
                    <CgSpinner className="animate-spin" size={20} />
                    <span>Confirming in wallet...</span>
                </div>
            )
        if (isConfirming)
            return (
                <div className="flex items-center justify-center gap-2 w-full">
                    <CgSpinner className="animate-spin" size={20} />
                    <span>Waiting for transaction to be included...</span>
                </div>
            )
        if (error || isError) {
            console.log(error)
            return (
                <div className="flex items-center justify-center gap-2 w-full">
                    <span>Error, see console.</span>
                </div>
            )
        }
        if (isConfirmed) {
            return "Transaction confirmed."
        }
        return isUnsafeMode ? "Send Tokens (Unsafe)" : "Send Tokens"
    }

    useEffect(() => {
        const savedTokenAddress = localStorage.getItem('tokenAddress')
        const savedRecipients = localStorage.getItem('recipients')
        const savedAmounts = localStorage.getItem('amounts')

        if (savedTokenAddress) setTokenAddress(savedTokenAddress)
        if (savedRecipients) setRecipients(savedRecipients)
        if (savedAmounts) setAmounts(savedAmounts)
    }, [])

    useEffect(() => {
        localStorage.setItem('tokenAddress', tokenAddress)
    }, [tokenAddress])

    useEffect(() => {
        localStorage.setItem('recipients', recipients)
    }, [recipients])

    useEffect(() => {
        localStorage.setItem('amounts', amounts)
    }, [amounts])

    useEffect(() => {
        if (tokenAddress && totalInWei > 0 && tokenData?.[2]?.result !== undefined) {
            const userBalance = tokenData?.[2].result as bigint;
            setHasEnoughTokens(userBalance >= totalInWei);
        } else {
            setHasEnoughTokens(true);
        }
    }, [tokenAddress, totalInWei, tokenData]);

    useEffect(() => {
        if (!decimals) {
            setAmountsError(null);
            return;
        }
        
        const amountsArray = amounts.split(/[,\n]+/)
            .map(amt => amt.trim())
            .filter(amt => amt !== '');
            
        for (const amt of amountsArray) {
            try {
                parseUnits(amt, decimals);
                setAmountsError(null);
            } catch (error) {
                setAmountsError("Invalid amount format detected");
                return;
            }
        }
    }, [amounts, decimals]);

    return (
        <div
            className={`max-w-2xl min-w-full xl:min-w-lg w-full lg:mx-auto p-6 flex flex-col gap-6 bg-white rounded-xl ring-[4px] border-2 ${isUnsafeMode ? " border-red-500 ring-red-500/25" : " border-blue-500 ring-blue-500/25"}`}
        >
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-zinc-900">T-Sender</h2>
                <Tabs defaultValue={"false"}>
                    <TabsList>
                        <TabsTrigger value={"false"} onClick={() => onModeChange(false)}>
                            Safe Mode
                        </TabsTrigger>
                        <TabsTrigger value={"true"} onClick={() => onModeChange(true)}>
                            Unsafe Mode
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="space-y-6">
                <InputForm
                    label="Token Address"
                    placeholder="0x"
                    value={tokenAddress}
                    onChange={e => setTokenAddress(e.target.value)}
                />
                <InputForm
                    label="Recipients (comma or new line separated)"
                    placeholder="0x123..., 0x456..."
                    value={recipients}
                    onChange={e => setRecipients(e.target.value)}
                    large={true}
                />
                <InputForm
                    label={`Amounts (comma or new line separated)${decimals ? ` - Max decimals: ${decimals}` : ''}`}
                    placeholder="100, 200, 300..."
                    value={amounts}
                    onChange={e => setAmounts(e.target.value)}
                    large={true}
                />
                
                {amountsError && (
                    <div className="text-red-500 text-sm -mt-4">
                        {amountsError}
                    </div>
                )}

                <div className="bg-white border border-zinc-300 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-zinc-900 mb-3">Transaction Details</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-zinc-600">Token Name:</span>
                            <span className="font-mono text-zinc-900">
                                {tokenData?.[1]?.result as string || 'N/A'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-zinc-600">Amount (wei):</span>
                            <span className="font-mono text-zinc-900">{totalInWei.toString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-zinc-600">Amount (tokens):</span>
                            <span className="font-mono text-zinc-900">

                              {amounts.split(/[,\n]+/)
                                    .map(amt => amt.trim())
                                    .filter(amt => amt !== '')
                                    .reduce((sum, amt) => {
                                        const num = parseFloat(amt);
                                        return sum + (isNaN(num) ? 0 : num);
                                    }, 0)
                                    .toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>

                {isUnsafeMode && (
                    <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <RiAlertFill size={20} />
                            <span>
                                Using{" "}
                                <span className="font-medium underline underline-offset-2 decoration-2 decoration-red-300">
                                    unsafe
                                </span>{" "}
                                super gas optimized mode
                            </span>
                        </div>
                        <div className="relative group">
                            <RiInformationLine className="cursor-help w-5 h-5 opacity-45" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-zinc-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all w-64">
                                This mode skips certain safety checks to optimize for gas. Do not
                                use this mode unless you know how to verify the calldata of your
                                transaction.
                                <div className="absolute top-full left-1/2 -translate-x-1/2 -translate-y-1 border-8 border-transparent border-t-zinc-900"></div>
                            </div>
                        </div>
                    </div>
                )}

                <button
                    className={`cursor-pointer flex items-center justify-center w-full py-3 rounded-[9px] text-white transition-colors font-semibold relative border ${isUnsafeMode
                        ? "bg-red-500 hover:bg-red-600 border-red-500"
                        : "bg-blue-500 hover:bg-blue-600 border-blue-500"
                        } ${!hasEnoughTokens && tokenAddress ? "opacity-50 cursor-not-allowed" : ""}`}
                    onClick={handleSubmit}
                    disabled={isPending || (!hasEnoughTokens && tokenAddress !== "") || !amountsValid}
                >
                    {/* Gradient */}
                    <div className="absolute w-full inset-0 bg-gradient-to-b from-white/25 via-80% to-transparent mix-blend-overlay z-10 rounded-lg" />
                    {/* Inner shadow */}
                    <div className="absolute w-full inset-0 mix-blend-overlay z-10 inner-shadow rounded-lg" />
                    {/* White inner border */}
                    <div className="absolute w-full inset-0 mix-blend-overlay z-10 border-[1.5px] border-white/20 rounded-lg" />
                    {isPending || error || isConfirming
                        ? getButtonContent()
                        : !hasEnoughTokens && tokenAddress
                            ? "Insufficient token balance"
                            : !amountsValid
                                ? "Invalid amounts"
                                : isUnsafeMode
                                    ? "Send Tokens (Unsafe)"
                                    : "Send Tokens"}
                </button>
            </div>
        </div>
    )
}

