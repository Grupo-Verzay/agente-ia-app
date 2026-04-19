import { transformationTypes } from '@/constants'
import { currentUser } from "@/lib/auth"
import { redirect } from 'next/navigation'
import { ResellerCreditPage } from '../credits/_components'

type TransformationTypeKeys = keyof typeof transformationTypes

interface SearchParamProps {
  params: {
    type: TransformationTypeKeys
  }
};

const ToolsPage = async ({ params: { type } }: SearchParamProps) => {
  const user = await currentUser();

  if (!user) {
    redirect('/login')
  };

  return (
    <ResellerCreditPage />
  )
}

export default ToolsPage