interface HeaderProps {
  title: string;
  subtitle?: string;
}

const Header = ({ title, subtitle }: HeaderProps) => {
  return (
      <div className="flex flex-col items-start space-y-2">
        {/* Título */}
        <h2 className="h3-bold text-gray-900 dark:text-white">{title}</h2>

        {/* Subtítulo */}
        {subtitle && (
          <p className="p-16-regular text-gray-600 dark:text-gray-300">
            {subtitle}
          </p>
        )}
      </div>
  );
};

export default Header;
