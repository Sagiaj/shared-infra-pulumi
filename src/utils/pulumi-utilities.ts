import * as pulumi from "@pulumi/pulumi";

export function GetValue<T>(output: pulumi.Output<T>) {
    return new Promise<T>((resolve, reject)=>{
        output.apply(value=>{
            resolve(value);
        });
    });
}
