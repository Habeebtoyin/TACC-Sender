"use client"

import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { arbitrum, base, mainnet, optimism, anvil, zksync, sepolia, bscTestnet, bsc } from "wagmi/chains"

export default getDefaultConfig({
    appName: "TSender",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
    chains: [mainnet, optimism, arbitrum, base, zksync, sepolia, anvil, bscTestnet, bsc],
    ssr: false,
})
