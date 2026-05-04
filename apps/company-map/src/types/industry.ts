export type Industry = {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type IndustryNode = Industry & {
  children: IndustryNode[];
};
