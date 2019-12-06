export default interface CookieCheckable{
    checkCookieAlive(): Promise<boolean>;
    getName(): string;
    // setCookie();
}