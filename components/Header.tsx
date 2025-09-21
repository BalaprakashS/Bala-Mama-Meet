import React from "react";
import Image from "next/image";
import { AiFillGithub } from "react-icons/ai";
import { Flex, Spacer } from "@chakra-ui/react";

import muxLogo from "../public/flag.webp";

export default function Header(): JSX.Element {
  return (
    <Flex
      zIndex={2}
      padding="2"
      alignItems="center"
      justifyContent="space-between"
      backgroundColor="#292929"
      borderBottom="1px solid #e8e8e8"
    >
      <Flex alignItems="center" padding="10px" width="290px">
        <a
          href="https://github.com/BalaprakashS"
          target="_blank"
          rel="noreferrer"
        >
          <Image
            src={muxLogo}
            alt="logo"
            width={150}
            height={100} // or leave if you want "auto" with style
            priority
            style={{ height: "auto" }}
          />
        </a>
      </Flex>
      <Spacer />
      <Flex alignItems="center" padding="10px">
        <a
          href="https://github.com/BalaprakashS"
          target="_blank"
          rel="noreferrer"
        >
          <AiFillGithub color="white" size="40px" />
        </a>
      </Flex>
    </Flex>
  );
}
