
export const onTokensToCredits = (tokens: number): number => {
    return Math.ceil(tokens / 3085); // 1 crédito ≈ 3,085 tokens
};

export const onCreditsToTokens = (credits: number): number => {
    return Math.ceil(credits * 3085); // 1 crédito ≈ 3,085 tokens
};
