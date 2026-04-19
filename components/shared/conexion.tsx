"use client";
import Link from "next/link";

interface ConexionButtonProps {
  title: string;
  description: string;
  link: string;
  buttonLabel: string;
}

const ConexionButton = ({ title, description, link, buttonLabel }: ConexionButtonProps) => {
  return (
    <div className="max-w-xs mx-auto bg-white shadow-lg rounded-md overflow-hidden border border-gray-200 hover:shadow-xl transition-shadow duration-300">
      <div className="p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{title}</h2>
        <p className="text-sm text-gray-600 mb-4">{description}</p>
        <Link href={link}>
          <button className="w-full py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition-colors duration-200">
            {buttonLabel}
          </button>
        </Link>
      </div>
    </div>
  );
};

export default ConexionButton;
