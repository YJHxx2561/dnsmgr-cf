declare module 'bcryptjs' {
  const bcrypt: {
    hash(password: string, salt: number | string): Promise<string>;
    compare(password: string, hash: string): Promise<boolean>;
    hashSync(password: string, salt: number | string): string;
    compareSync(password: string, hash: string): boolean;
  };
  export default bcrypt;
}
