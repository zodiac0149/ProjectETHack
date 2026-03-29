export type Sector = "IT" | "Agriculture" | "Real Estate" | "Other";
export type Sentiment = "Bullish" | "Bearish" | "Neutral";

export type AtomTags = {
  sector: Sector;
  sentiment: Sentiment;
  entities: string[];
};

export type Atom = {
  atom_id: string;
  url: string;
  article_title?: string | null;
  idx: number;
  text: string;
  created_at: string;
  tags?: AtomTags | null;
};

export type VerificationResult = {
  is_true: boolean;
  score: number; 
  reasoning: string;
  supported_claims: string[];
  unsupported_claims: string[];
  conflicting_atom_ids: string[];
};

export type VideoDraft = {
  hindi_title: string;
  hindi_sentences: string[];
  layman_analogies: string[];
  keywords: string[];
  critic: {
    pass: boolean;
    issues: string[];
    unsupported_claims: string[];
  };
};

export type SocialPost = {
  post_id: string;
  platform: "Twitter" | "LinkedIn";
  content: string;
  source_atom_ids: string[];
  verification?: VerificationResult | null;
  created_at: string;
};
