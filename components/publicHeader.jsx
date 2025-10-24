import Image from "next/image";
import { useRouter } from "next/router";

export default function CustomHeader() {
    const router = useRouter();
  return (
    <header
      style={{
        width: "100%",
        background: "transparent",
        padding: "18px 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderBottom: "2px solid #e9ecef",
        gap: 20,
        position: "relative",
        zIndex: 10,
      }}
    >
      <Image
        src="/logo.png"
        alt="Trackify Logo"
        width={60}
        height={60}
        style={{
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 2px 8px rgba(31,168,220,0.10)",
          objectFit: "cover",
          marginLeft: "20px"
        }}
        onClick={() => router.push('/')}
      />
      <span
        style={{
          fontWeight: 900,
          fontSize: 24,
          color: "#FFFFFF",
          textShadow: "0 2px 8px rgba(31,168,220,0.10)",
        }}
      >
        Mr. Ahmad Badr Trackify System
      </span>
      <style jsx>{`
        @media (max-width: 768px) {
          span {
            font-size: 20px !important;
            letter-spacing: 0.8px !important;
          }
          img {
            width: 50px !important;
            height: 50px !important;
          }
        }
        @media (max-width: 480px) {
          span {
            font-size: 17px !important;
            letter-spacing: 0.5px !important;
          }
        }
      `}</style>
    </header>
  );
}
