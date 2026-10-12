import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:!bg-[#38192B] group-[.toaster]:!text-[#FCF4F9] group-[.toaster]:!border group-[#38192B] group-[.toaster]:!rounded-2xl group-[.toaster]:!shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]",
          title: "group-[.toast]:!text-[#FCF4F9] group-[.toast]:!font-semibold group-[.toast]:!text-sm",
          description: "group-[.toast]:!text-[#BCA7B4] group-[.toast]:!text-xs",
          actionButton: "group-[.toast]:!bg-[#FE7802] group-[.toast]:!text-[#290E1F] group-[.toast]:!rounded-full group-[.toast]:!font-semibold",
          cancelButton: "group-[.toast]:!bg-transparent group-[.toast]:!text-[#BCA7B4] group-[.toast]:!border group-[.toast]:!border-[#503243] group-[.toast]:!rounded-full",
          closeButton: "group-[.toast]:!bg-[#290E1F] group-[.toast]:!border-[#503243] group-[.toast]:!text-[#BCA7B4]",
          success: "group-[.toast]:!border-[#6BBF7A] group-[.toast]:[&_[data-icon]]:!text-[#A8E0B0]",
          error: "group-[.toast]:!border-[#D65C5C] group-[.toast]:[&_[data-icon]]:!text-[#F4A0A0]",
          warning: "group-[.toast]:!border-[#E8A87C] group-[.toast]:[&_[data-icon]]:!text-[#F2C6A0]",
          info: "group-[.toast]:!border-[#503243] group-[.toast]:[&_[data-icon]]:!text-[#FCF4F9]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };