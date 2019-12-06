import AndroidPublishHelper from "./AndroidPublishHelper";
import CookieCheckable from "./CookieCheckable";

export default abstract class AndroidPublishHelperWithCookieCheck extends AndroidPublishHelper implements CookieCheckable{
    
    
    abstract checkCookieAlive(): Promise<boolean> ;


}