/* eslint-disable @next/next/no-img-element */
"use client";

import Image from "next/image";
import type { ImgHTMLAttributes } from "react";

const NEXT_IMAGE_HOSTS = new Set(["medias3.verzay.co"]);

type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
    src: string;
    alt: string;
    fill?: boolean;
    sizes?: string;
    priority?: boolean;
    quality?: number;
};

function canUseNextImage(src: string) {
    if (!src) return false;
    if (src.startsWith("/") || src.startsWith("data:") || src.startsWith("blob:")) {
        return true;
    }

    try {
        const url = new URL(src);
        return NEXT_IMAGE_HOSTS.has(url.hostname);
    } catch {
        return false;
    }
}

export function SafeImage({
    src,
    alt,
    fill = false,
    sizes,
    priority,
    quality,
    className,
    style,
    onClick,
    width,
    height,
    ...imgProps
}: SafeImageProps) {
    const shouldUseNextImage =
        canUseNextImage(src) &&
        (fill || (typeof width === "number" && typeof height === "number"));

    if (shouldUseNextImage) {
        if (fill) {
            return (
                <Image
                    {...(imgProps as any)}
                    src={src}
                    alt={alt}
                    className={className}
                    style={style}
                    onClick={onClick as any}
                    sizes={sizes}
                    priority={priority}
                    quality={quality}
                    unoptimized
                    fill
                />
            );
        }

        return (
            <Image
                {...(imgProps as any)}
                src={src}
                alt={alt}
                className={className}
                style={style}
                onClick={onClick as any}
                sizes={sizes}
                priority={priority}
                quality={quality}
                unoptimized
                width={width}
                height={height}
            />
        );
    }

    return (
        <img
            src={src}
            alt={alt}
            className={className}
            style={style}
            onClick={onClick}
            width={width}
            height={height}
            {...imgProps}
        />
    );
}
