export type TokenHolderResult = {
    owner: string,
    amount: number,
  }
  
export type ApiResponse  = {
    result: {
      token_accounts: TokenHolderResult[];
    };
}